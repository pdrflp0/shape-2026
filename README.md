# Shape 2026

App pessoal de treino (PWA) para iPhone: Upper/Lower 4 dias, progressão dupla, timer de descanso, cardio, dieta e progresso. Funciona 100% offline e guarda tudo no próprio aparelho (IndexedDB).

## Onde editar os exercícios

Tudo do programa está em **`program.json`**. Você não precisa mexer em mais nada.

| O que | Onde em `program.json` |
|---|---|
| Exercícios de cada treino | `workouts.UA` (Superior A), `LA` (Inferior A), `UB` (Superior B), `LB` (Inferior B) → `exercises` |
| Séries / faixa de reps | `sets`, `reps: [min, max]` (`"unit": "s"` = por tempo, ex.: prancha) |
| Composto (★, 150 s) ou isolado (75 s) | `type: "compound"` / `"isolation"` |
| Quanto subir de carga | `inc` (kg) e `load` (`barbell`, `machine`, `dumbbell`, `cable`, `bodyweight`) |
| Alternativa ("aparelho ocupado") | `alt: { name, equip, anim, load, inc }` |
| Bi-set | dê o mesmo `superset` aos dois exercícios seguidos |
| Avisos por semana | `warnings: [{ weeks: [1,2], text, bodyweight: true }]` |
| Passos, erros, porquê | `steps`, `mistakes`, `why` |
| Ilustração | `anim` (veja os nomes em `js/figures.js` → `ANIMS`) |
| Fases, RIR, cardio, descansos padrão | `phases`, `cardio`, `rest` |

O histórico fica ligado ao `id` do exercício. Se você trocar o `id`, o histórico antigo deixa de aparecer para ele.

Depois de editar e publicar, o app baixa a versão nova sozinho e ela aparece **na próxima vez que você abrir o app**. Para forçar a atualização, aumente `VERSION` em `sw.js`.

## Instalar no iPhone

1. Abra o link no **Safari**. Precisa ser o Safari, não o Chrome.
2. Toque em **Compartilhar** (o quadrado com a seta para cima).
3. Role e toque em **Adicionar à Tela de Início** → **Adicionar**.
4. Abra pelo ícone **Shape 2026**. Ele abre em tela cheia, como um app.
5. Abra o app uma vez com internet para ele guardar tudo no cache. Depois disso, funciona sem sinal.
6. Para ouvir o beep do descanso, desligue o modo silencioso (chave lateral). O flash na tela aparece sempre.

## Backup

O iOS pode apagar os dados de apps web que ficam muito tempo sem uso. Faça backup toda semana:

1. **Perfil → Exportar backup (JSON)** → **Salvar em Arquivos** (de preferência no iCloud Drive).
2. Para restaurar: **Perfil → Importar backup** → escolha o arquivo. Isso substitui os dados atuais.

O backup inclui histórico, fotos, dieta, medidas e configurações.

## Rodar localmente

```bash
python3 -m http.server 8642
```

Abra `http://localhost:8642`. Para gerar os ícones de novo: `node tools/make-icons.mjs`.

## Estrutura

```
index.html  manifest.json  sw.js  program.json
css/app.css
js/app.js (abas e navegação)  db.js (IndexedDB e backup)  program.js (semana, fase, sequência)
js/progression.js (progressão dupla, Epley)  timer.js (descanso, wake lock, beep)
js/figures.js (ilustrações SVG)  charts.js  ui.js  day.js
js/screens/ today · workouts · session · cardio · progress · diet · profile
```
