// ============================================================================
//  MyFLL.lab :: manual.js
//  Manual em português: como usar, API SPIKE 3 e Pybricks, contas, dicas FLL.
// ============================================================================
import { SPIKE_API, PB_API } from './apidata.js';
import { esc } from './ui.js';

function apiTable(groups) {
  let h = '';
  for (const g of groups) {
    h += `<h4 id="api-${g.mod}">${esc(g.mod)}</h4><p><code>${esc(g.imp)}</code> · ${esc(g.desc)}</p><table><tr><th>nome</th><th>o que faz</th></tr>`;
    const consts = g.items.filter(i => i.c !== undefined || (!i.sig && !i.sub));
    for (const it of g.items) {
      if (it.c !== undefined || (!it.sig && !it.sub)) continue;
      h += `<tr><td><code>${esc(it.sig || it.n)}</code>${it.r ? ` <span class="mute">→ ${esc(it.r)}</span>` : ''}</td><td>${esc(it.d)}</td></tr>`;
    }
    if (consts.length) h += `<tr><td colspan="2">${consts.map(c => `<code>${esc(c.n)}${c.c !== undefined ? ' = ' + c.c : ''}</code>`).join(' ')}</td></tr>`;
    h += '</table>';
  }
  return h;
}

export function renderManual(root) {
  root.innerHTML = `<div class="doc">
<h3>Manual do MyFLL.lab</h3>
<div class="toc">
  <a href="#m-inicio">começar</a><a href="#m-tapete">tapete da equipe</a><a href="#m-programa">programa SPIKE</a><a href="#m-api">API SPIKE 3</a><a href="#m-pyb">Pybricks</a>
  <a href="#m-contas">contas úteis</a><a href="#m-fll">dicas FLL</a><a href="#m-sim">como simula</a><a href="#m-atalhos">atalhos</a>
</div>

<h4 id="m-inicio">Começar em 5 passos</h4>
<ol>
  <li><b>ROBÔ</b>: escolha um modelo pronto ou monte o seu (portas A a F, rodas, sensores, braços).</li>
  <li><b>MESA</b>: use um tapete pronto, gere um mapa ou desenhe linhas, zonas e modelos.</li>
  <li><b>MISSÕES</b>: gere uma temporada com semente e pontuação.</li>
  <li><b>CÓDIGO</b>: escreva em Python (SPIKE 3 ou Pybricks) e clique <b>▶ EXECUTAR</b>. Há 20 posições de programa, como no hub.</li>
  <li>Acompanhe o robô, o console (print) e o painel do hub. Arraste o robô para reposicionar; <span class="kbd">R</span> reinicia a mesa.</li>
</ol>
<p>No hub virtual, os botões <b>◀ ▶</b> escolhem o programa e o botão <b>central</b> executa ou para, igual ao hub de verdade. O console embaixo aceita comandos Python soltos (REPL), por exemplo <code>from hub import port</code> e depois <code>import motor</code> e <code>motor.run(port.E, 200)</code>.</p>

<h4 id="m-tapete">Treinar no tapete da sua equipe</h4>
<ol>
  <li>Na aba <b>MESA</b>, em <b>Imagem</b>, carregue a foto ou o arquivo do tapete que a equipe usa (PNG, JPG ou WebP), ou arraste o arquivo para a mesa. Se a imagem vier em PDF, exporte antes como imagem.</li>
  <li>Escolha o ajuste (esticar, encaixar ou preencher) e, se preciso, gire 180°. O sensor de cor passa a ler as cores da imagem.</li>
  <li>Use <b>limpar mesa e manter a imagem</b>, coloque os modelos com a ferramenta <b>Objeto</b> (caixas, alavancas, botões, bandeiras, cestas) nos lugares das missões e crie as missões na aba <b>MISSÕES</b>.</li>
  <li>Salve em <b>Mesa + missões (JSON)</b>: o arquivo leva a imagem, os modelos, as missões e a posição de saída. Os alunos abrem com <b>Abrir mesa + missões</b>.</li>
</ol>

<h4 id="m-programa">Estrutura de um programa SPIKE 3</h4>
<pre>from hub import port, light_matrix
import motor_pair, runloop

async def main():                  # a função principal é async
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 0)   # await espera terminar
    await light_matrix.write('Fim')

runloop.run(main())                # inicia o programa</pre>
<ul>
  <li><b>await</b> espera o movimento terminar. Sem await o comando começa e o programa continua na hora (útil para mover duas coisas juntas).</li>
  <li>As velocidades e ângulos do SPIKE 3 são <b>inteiros</b>. Uma conta como <code>300 * 1.5</code> dá float e gera <code>TypeError</code>, exatamente como no hub: use <code>int(...)</code>.</li>
  <li>Laços que leem sensores precisam de <code>await runloop.sleep_ms(10)</code> dentro para dar tempo às outras tarefas.</li>
  <li>Porta sem o dispositivo certo gera <code>OSError: [Errno 19] ENODEV</code>, como no robô.</li>
</ul>

<h3 id="m-api">API SPIKE 3</h3>
<p class="mute">Mesmos nomes, parâmetros e unidades do Python do app SPIKE (versão 3) para o hub Prime.</p>
${apiTable(SPIKE_API)}

<h3 id="m-pyb">Pybricks</h3>
<p>Escolha <b>Pybricks</b> no seletor do editor. Programas comuns (sem async) bloqueiam em cada comando, como no Pybricks real. Com <code>async def</code> e <code>run_task</code> você usa <code>await</code> e <code>multitask</code>.</p>
<pre>from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction
from pybricks.robotics import DriveBase

hub = PrimeHub()
robo = DriveBase(Motor(Port.A, Direction.COUNTERCLOCKWISE), Motor(Port.B), 56, 136)
robo.straight(300)     # mm
robo.turn(90)          # graus, positivo vira à direita</pre>
${apiTable(PB_API)}

<h3 id="m-contas">Contas úteis</h3>
<table>
<tr><th>quero</th><th>conta</th></tr>
<tr><td>graus do motor para andar <i>d</i> mm</td><td><code>graus = d * 360 / (3.1416 * diâmetro)</code> · roda 56 mm: 2,05 graus por mm</td></tr>
<tr><td>graus para girar no lugar <i>a</i> graus</td><td><code>graus = a * bitola / diâmetro</code> · bitola 136, roda 56: 219 graus para 90°</td></tr>
<tr><td>guinada em graus (SPIKE 3)</td><td><code>motion_sensor.tilt_angles()[0] / 10</code> · anti-horário positivo</td></tr>
<tr><td>girar sobre uma roda</td><td>steering 50 (direita) ou -50 (esquerda)</td></tr>
<tr><td>velocidade em mm/s</td><td><code>graus_por_s * 3.1416 * diâmetro / 360</code></td></tr>
</table>

<h3 id="m-fll">Dicas de equipe FLL</h3>
<ul>
  <li><b>Comece sempre igual.</b> Use um gabarito na BASE (aqui: "definir início"). Um grau de erro na saída vira 3 cm depois de 1,7 m.</li>
  <li><b>Não confie só nos graus da roda.</b> Rodas escorregam e têm diâmetros levemente diferentes; o simulador reproduz isso. Use o giroscópio para andar reto e girar.</li>
  <li><b>Recalibre no caminho</b>: alinhe numa linha com dois sensores de cor ou encoste numa parede para zerar o erro.</li>
  <li><b>Acelere e freie com calma.</b> Acelerações altas fazem as rodas patinarem e o robô "empinar".</li>
  <li><b>Bateria importa.</b> Com bateria fraca o motor tem menos velocidade máxima; programas por tempo mudam de resultado (teste no ☰).</li>
  <li><b>Programa-menu</b>: um programa com várias saídas escolhidas nos botões economiza segundos na partida.</li>
  <li><b>Partida de 2:30</b>: na aba MISSÕES há cronômetro, fichas de precisão e placar para treinar como no torneio.</li>
</ul>

<h3 id="m-sim">Como o simulador funciona</h3>
<ul>
  <li><b>Física a 1000 passos por segundo</b> em tempo virtual: corpo rígido com massa e inércia calculadas das peças, pneus com atrito de Coulomb (patinam quando a força passa do limite), rodízio, transferência de peso na aceleração, colisões com bordas da mesa e modelos (com altura: o braço passa por cima do que é baixo).</li>
  <li><b>Motores</b> com curva torque-velocidade, atrito interno, inércia e tensão da bateria; o hub controla com perfil trapezoidal (aceleração/desaceleração) e PID a 200 Hz, detecta travamento e aplica COAST, BRAKE ou HOLD.</li>
  <li><b>Par de motores sincronizado</b>: se uma roda atrasa, a outra espera.</li>
  <li><b>Sensor de cor</b> lê a imagem real do tapete (1 px = 1 mm) sob um ponto que cresce com a altura; reflexão cai se o sensor estiver alto. <b>Distância</b> é um cone ultrassônico que considera a altura dos objetos. <b>Força</b> mede o contato real do botão.</li>
  <li><b>Giroscópio</b> integra a rotação com ruído, viés e pequeno erro de escala; guinada em décimos de grau.</li>
  <li><b>Imperfeições de fábrica</b> (semente no ☰): diâmetro das rodas, torque dos motores e desvio do giroscópio mudam um pouco de robô para robô. No modo "Ideal" tudo é perfeito.</li>
  <li><b>O Python é CPython real</b> (Pyodide) rodando o seu código com os módulos do hub; o tempo do programa é virtual e determinístico. Laços consomem tempo de CPU simulado (cerca de 45 µs por volta), como no hub.</li>
</ul>
<p class="note">Limites honestos: o tapete é plano (sem rampas), o robô não tomba, braços são modelos simplificados (frontal sobe/desce, lateral gira), e sons do app são sintetizados. Programas que funcionam aqui devem funcionar no robô, mas sempre ajuste as constantes no robô real.</p>

<h4 id="m-atalhos">Atalhos</h4>
<table>
<tr><td><span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> ou <span class="kbd">Espaço</span></td><td>executar o programa</td></tr>
<tr><td><span class="kbd">Esc</span></td><td>parar</td></tr>
<tr><td><span class="kbd">R</span></td><td>reiniciar a mesa</td></tr>
<tr><td><span class="kbd">Q</span> / <span class="kbd">E</span></td><td>girar o robô (ou o modelo arrastado) 5°; com Shift 45°</td></tr>
<tr><td><span class="kbd">Ctrl</span>+<span class="kbd">/</span></td><td>comentar linhas</td></tr>
<tr><td><span class="kbd">Ctrl</span>+<span class="kbd">Espaço</span></td><td>sugestões da API</td></tr>
<tr><td>MESA: <span class="kbd">V L Z C B T O X</span></td><td>selecionar, linha, zona, círculo, pincel, texto, objeto, borracha</td></tr>
<tr><td>MESA: <span class="kbd">Ctrl</span>+<span class="kbd">Z</span></td><td>desfazer</td></tr>
<tr><td>bordas entre os painéis</td><td>arraste para redimensionar (ou foque e use as setas); duplo clique volta ao padrão. A borda de baixo aumenta a altura da área de trabalho e a página rola.</td></tr>
</table>

<h4>Publicar no GitHub Pages</h4>
<p>O MyFLL.lab é um único arquivo <code>index.html</code>. Crie um repositório, envie o arquivo e ative <i>Settings → Pages</i>. O Python (Pyodide) é baixado da CDN jsDelivr na primeira vez e fica no cache do navegador. Os projetos ficam salvos no navegador de cada aluno; use ☰ para exportar e compartilhar.</p>

<h4>Créditos</h4>
<p>Projeto educacional independente, sem ligação com a LEGO ou a FIRST; FIRST LEGO League, SPIKE e LEGO são marcas de seus donos. Usa three.js (licença MIT) e Pyodide (licença MPL 2.0). A API segue a documentação pública do Python do SPIKE Prime e do Pybricks.</p>
</div>`;
  root.querySelectorAll('.toc a').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    const t = root.querySelector(a.getAttribute('href'));
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
