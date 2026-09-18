# Concord Desktop

Empacotamento do Concord (chat estilo Discord) como aplicativo Windows nativo via Electron.
**O site continua existindo e funcionando normalmente em https://concord-lukz.vercel.app.**
Este projeto é uma camada adicional — não substitui nem modifica o site.

## 1. Análise do projeto original

- **Tecnologia:** um único arquivo `index.html` com CSS e JavaScript embutidos (vanilla JS,
  sem framework, sem bundler, sem etapa de build).
- **Backend:** Supabase (Postgres + Realtime + Storage), chamado diretamente do navegador
  via `@supabase/supabase-js`, com a **chave publishable** (não é um segredo — é a chave
  pública protegida por RLS no banco, feita pra ficar no frontend).
- **Não existe** Next.js, API Routes, Server Actions, funções serverless nem variáveis de
  ambiente privadas. Não havia nada a "quebrar" nesse sentido: 100% do app já rodava no
  cliente.
- **Dependências externas:** dois `<script src>` de CDN (`supabase-js` e `gsap`), carregados
  por HTTPS — funcionam normalmente dentro do Electron.
- Como não há segredo algum no frontend, não havia nada para "esconder" ao empacotar.

Conclusão: a arquitetura mais adequada é empacotar o `index.html` (+ CSS/JS embutidos) como
o frontend local do Electron, mantendo as chamadas ao Supabase pela internet (exatamente
como já eram feitas no navegador).

## 2. Arquitetura

```
Frontend (app/index.html — HTML/CSS/JS únicos, sem build)
        ↓
electron/main.js  →  BrowserWindow.loadFile("app/index.html")
        ↓
Aplicativo Windows empacotado (Concord.exe dentro do instalador)
        ↓
electron-builder (NSIS)  →  instalador .exe
```

Não existe **nenhum** `loadURL("https://concord-lukz.vercel.app")` em lugar nenhum do
código — confirmado por busca no `main.js`. O app carrega o arquivo local empacotado
dentro do `.asar` e, a partir daí, o JavaScript do próprio Concord fala com o Supabase
pela internet, do mesmo jeito que fazia no navegador.

```
/electron
  main.js      → cria a janela, carrega app/index.html localmente, contextIsolation
  preload.js   → único ponto de contato entre o frontend e o processo principal
/app
  index.html   → o frontend do Concord (cópia do arquivo que roda no site)
/build
  icon.png / icon.ico → ícone do app (gerado a partir das cores do Concord, verde→azul)
package.json   → scripts + configuração do electron-builder
```

### Segurança
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `preload.js` expõe **só** `window.concordDesktop.{isDesktopApp, platform, versions}` —
  nada de `ipcRenderer`, `require`, `fs` ou qualquer API do Node chega ao frontend.
- Links externos abrem no navegador do sistema (`shell.openExternal`), nunca dentro do
  Electron.

## 3. Como rodar

```bash
npm install
```

**Site/frontend isolado (sem Electron), só pra conferir o HTML localmente:**
```bash
npm run dev
# abre em http://localhost:5500
```

**Aplicativo desktop em desenvolvimento:**
```bash
npm run electron:dev
```

**Gerar o instalador Windows (.exe):**
```bash
npm run dist
```

O resultado sai em `dist/`:
- `Concord Setup 1.0.0.exe` — instalador NSIS completo (recomendado)
- `Concord Portable 1.0.0.exe` — versão portátil, um único .exe, sem instalar nada

## 4. O que o instalador NSIS faz

- Permite escolher o diretório de instalação (não é "one-click")
- Cria atalho na Área de Trabalho
- Cria atalho no Menu Iniciar ("Concord")
- Registra nome, versão e ícone do app no Windows
- Aparece corretamente em "Adicionar ou remover programas", com desinstalador

Configurado em `package.json` → `build.nsis`.

## 5. Ícone e identidade

O projeto original não tinha nenhum arquivo de ícone/logo. Gerei um ícone provisório
(`build/icon.png` e `build/icon.ico`) usando o gradiente verde→azul que já é a identidade
visual do Concord no app. Se você tiver um logo definitivo, é só substituir
`build/icon.ico` (Windows) e `build/icon.png` (Linux/tray) pelos seus arquivos — o
`package.json` já aponta pra esses caminhos, não precisa mexer em mais nada.

## 6. Atualizações automáticas (arquitetura preparada, não ativada)

A dependência `electron-updater` já está instalada e `electron/main.js` tem o trecho
comentado explicando exatamente onde ligar:

```js
const { autoUpdater } = require("electron-updater");
autoUpdater.checkForUpdatesAndNotify();
```

Como funcionaria quando você quiser ativar:
1. Publicar os `.exe` gerados em um feed de releases (o mais simples: **GitHub Releases**,
   configurando `build.publish` no `package.json` com `provider: "github"` e o repositório).
2. Cada vez que o app abre, `electron-updater` compara `app.getVersion()` (a versão
   instalada) com a última versão publicada no feed.
3. Se houver uma nova, baixa o instalador em background e o usuário só precisa reiniciar
   o app pra aplicar.

Não ativei agora porque isso exige ter um repositório/feed de releases público — não é
algo que eu deva decidir sozinho (custo, onde hospedar, se o repo é público ou privado).
A arquitetura já está pronta pra isso assim que você decidir onde publicar.

## 7. O que depende de internet e o que roda local

| Parte | Onde roda |
|---|---|
| Interface (HTML/CSS/JS, layout, animações) | 100% local, dentro do `.exe` |
| Login/nome de usuário | Local (salvo em `localStorage` do próprio Electron) |
| Mensagens, servidores, canais, perfis | Internet — Supabase (Postgres + Realtime) |
| Chamada de voz / compartilhar tela | Internet — WebRTC (P2P) + Supabase Realtime para sinalização |
| Upload de avatar/banner | Internet — Supabase Storage |

Ou seja: o app **abre e mostra a interface mesmo sem internet**, mas precisa de conexão
pra carregar servidores/mensagens/chamadas — exatamente como o Discord de verdade.

## 8. Limitações conhecidas

- **Build gerado neste ambiente Linux**, usando `wine` para o empacotamento Windows
  (é assim que `electron-builder` produz `.exe` fora do Windows). O binário resultante é
  um `.exe` Windows real e válido, mas o processo de build em si não foi testado em uma
  máquina Windows nativa — se você quiser gerar novos builds no futuro, pode rodar
  `npm run dist` direto num Windows ou WSL, sem precisar de `wine`.
- **Sem assinatura de código (code signing).** O Windows/SmartScreen vai mostrar o aviso
  padrão de "editor desconhecido" na primeira execução do instalador, porque não há
  certificado de assinatura configurado. Isso é normal para apps não publicados na
  Microsoft Store e não afeta o funcionamento — só o aviso visual. Se quiser remover o
  aviso, é preciso comprar um certificado de assinatura de código (EV ou OV) e configurar
  em `build.win.certificateFile`.
- **Câmera na chamada de voz** já era só uma prévia local no site (não implementada de
  verdade) — esse comportamento não mudou no desktop.
