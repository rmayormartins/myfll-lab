# MyFLL.lab

Simulador de robô no estilo **FIRST LEGO League** para treinar programação em **Python do hub SPIKE Prime**, direto no navegador. Monte o robô, desenhe ou gere a mesa, crie missões, programe e rode uma partida de 2:30, tudo em um único arquivo `index.html`.

O código que você escreve aqui usa **os mesmos módulos, nomes e unidades** do Python do app SPIKE (versão 3) e do **Pybricks**. A ideia é treinar no computador e levar o programa para o robô de verdade, ajustando só as constantes.

> Projeto educacional independente, sem ligação com a LEGO ou a FIRST. FIRST LEGO League, SPIKE e LEGO são marcas de seus respectivos donos.

## Como usar

1. Abra o `index.html` num navegador moderno (Chrome, Edge, Firefox ou Safari). Na primeira vez ele baixa o Python (Pyodide, alguns megabytes) da CDN jsDelivr; depois fica no cache.
2. **ROBÔ**: escolha um modelo pronto (competição, simples, varredor lateral, rodas grandes) ou monte o seu: hub, motores grande/médio/pequeno, rodas, rodízio, sensores de cor, distância e força, braço frontal e braço lateral, cada um numa porta de A a F.
3. **MESA**: use um tapete pronto, gere um mapa aleatório com semente ou desenhe linhas, zonas, círculos, textos e modelos de missão.
4. **MISSÕES**: gere uma temporada (tema + semente) ou crie missões à mão. Inicie uma **partida** com cronômetro, fichas de precisão e placar.
5. **CÓDIGO**: escreva em SPIKE 3 ou Pybricks e clique **▶ EXECUTAR**. Há 20 posições de programa, como no hub. A aba **EXEMPLOS** tem 20 programas prontos (seguidor de linha, PID, giroscópio, menu de saídas, multitarefa e outros).

O hub virtual funciona como o real: **◀ ▶** trocam o programa, o botão central executa e para, a matriz 5x5 mostra imagens e textos, e o console embaixo aceita comandos Python soltos (REPL).

## O que o simulador reproduz

* **API SPIKE 3**: `runloop`, `motor`, `motor_pair`, `color_sensor`, `distance_sensor`, `force_sensor`, `color`, `hub` (`port`, `light_matrix`, `motion_sensor`, `button`, `light`, `sound`), `device`, `orientation`, `app` (`linegraph`, `bargraph`, `display`, `music`, `sound`). Inclui os mesmos erros do hub: valor float onde se espera inteiro gera `TypeError`, porta sem o dispositivo certo gera `OSError: [Errno 19] ENODEV`.
* **Pybricks**: `PrimeHub` (display, luz, botões, alto-falante, IMU), `Motor`, `DriveBase` (com e sem giroscópio), `ColorSensor`, `UltrasonicSensor`, `ForceSensor`, `tools` (`wait`, `StopWatch`, `multitask`, `run_task`, `hub_menu`) e `parameters`. Programas comuns bloqueiam em cada comando; com `async def` e `run_task` você usa `await`.
* **Python de verdade**: CPython (Pyodide) rodando num Web Worker, com tempo virtual determinístico. Laços consomem tempo de CPU simulado, como no hub.
* **Física**: 1000 passos por segundo, massa e inércia calculadas das peças montadas, pneus com atrito (patinam), rodízio, transferência de peso, colisões com altura (o braço passa por cima do que é baixo).
* **Motores**: curva torque x velocidade, tensão da bateria, controle com perfil trapezoidal e PID a 200 Hz, detecção de travamento, modos COAST, BRAKE e HOLD, par de motores sincronizado.
* **Sensores**: cor lê a imagem real do tapete (1 px = 1 mm); distância é um cone ultrassônico que considera altura e ângulo; força mede o contato real; giroscópio com ruído, viés e erro de escala.
* **Imperfeições de fábrica** (menu ☰): pequenas diferenças de roda, motor e giroscópio, controladas por semente. Há também o modo "Ideal".

Limites: o tapete é plano (sem rampas), o robô não tomba, os braços são modelos simplificados e os sons do app são sintetizados.

## Publicar no GitHub Pages

1. Crie um repositório (por exemplo `myfll-lab`) e envie os arquivos deste projeto. Só o `index.html` já basta para o site funcionar.
2. No repositório, vá em **Settings > Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve.
3. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/myfll-lab/`.

Os projetos de cada aluno ficam salvos no próprio navegador. Pelo menu ☰ dá para exportar e importar o projeto inteiro (robô, mesa, missões e programas) em JSON, e cada aba tem exportação própria (robô, mapa em JSON ou PNG, programas em `.py`).

## Desenvolvimento

O código-fonte fica em `src/` e o arquivo final é montado com esbuild:

```bash
npm install
npm run build      # gera dist/index.html e copia para ./index.html
```

Estrutura:

| pasta | conteúdo |
| --- | --- |
| `src/sim/` | física, robô, hub (controle dos motores, IMU, matriz), sensores e o worker que roda o Python |
| `src/py/` | módulos Python simulados: `spike.py` (SPIKE 3), `pybricks.py` e `rt.py` (agendador e transformação do código) |
| `src/common/` | catálogo de peças e modelos de robô, objetos da mesa, fontes da matriz |
| `src/main/` | interface: vista 3D, montador, editor de mapa, missões, editor de código, exemplos, manual |

## Créditos

* [three.js](https://threejs.org) (licença MIT) para a vista 3D.
* [Pyodide](https://pyodide.org) (licença MPL 2.0) para o Python no navegador.
* A API segue a documentação pública do Python do SPIKE Prime (app 3) e do [Pybricks](https://docs.pybricks.com).
