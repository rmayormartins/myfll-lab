// ============================================================================
//  MyFLL.lab :: apidata.js
//  Referência da API (SPIKE 3 e Pybricks) usada pelo MANUAL e pelo
//  autocompletar do editor. Descrições em português.
// ============================================================================

const PORT_NOTE = 'port: port.A até port.F';

export const SPIKE_API = [
  {
    mod: 'runloop', imp: 'import runloop', desc: 'Executa funções async (tarefas) e espera tempo ou condições. Todo programa SPIKE termina com runloop.run(main()).',
    items: [
      { n: 'run', sig: 'run(*functions)', d: 'Inicia uma ou mais funções async em paralelo e espera todas terminarem. Ex.: runloop.run(main()) ou runloop.run(tarefa1(), tarefa2()).' },
      { n: 'sleep_ms', sig: 'sleep_ms(duration)', d: 'Aguardável: espera duration milissegundos. Use com await.', r: 'Awaitable' },
      { n: 'until', sig: 'until(function, timeout=0)', d: 'Aguardável: espera até function() devolver True (timeout em ms, 0 = sem limite).', r: 'Awaitable' },
    ],
  },
  {
    mod: 'motor', imp: 'import motor', desc: 'Controla um motor em uma porta. Velocidade em graus por segundo (grande: ±1050, médio: ±1110, pequeno: ±660). Os valores precisam ser inteiros.',
    items: [
      { n: 'run', sig: 'run(port, velocity, *, acceleration=1000)', d: 'Gira sem parar até receber outro comando.' },
      { n: 'run_for_degrees', sig: 'run_for_degrees(port, degrees, velocity, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Gira um número de graus. Com await, espera terminar; sem await, continua o programa enquanto o motor gira.', r: 'Awaitable' },
      { n: 'run_for_time', sig: 'run_for_time(port, duration, velocity, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Gira por duration milissegundos.', r: 'Awaitable' },
      { n: 'run_to_absolute_position', sig: 'run_to_absolute_position(port, position, velocity, *, direction=motor.SHORTEST_PATH, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Vai até a posição absoluta (-180 a 179) usando o caminho escolhido.', r: 'Awaitable' },
      { n: 'run_to_relative_position', sig: 'run_to_relative_position(port, position, velocity, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Vai até uma posição do contador relativo.', r: 'Awaitable' },
      { n: 'stop', sig: 'stop(port, *, stop=motor.BRAKE)', d: 'Para o motor (COAST solta, BRAKE freia, HOLD segura a posição).' },
      { n: 'set_duty_cycle', sig: 'set_duty_cycle(port, pwm)', d: 'Potência direta, sem controle de velocidade (-10000 a 10000).' },
      { n: 'relative_position', sig: 'relative_position(port)', d: 'Contador de graus do motor.', r: 'int' },
      { n: 'reset_relative_position', sig: 'reset_relative_position(port, position)', d: 'Define o valor atual do contador (normalmente 0).' },
      { n: 'absolute_position', sig: 'absolute_position(port)', d: 'Posição absoluta do eixo, de -180 a 179 graus.', r: 'int' },
      { n: 'velocity', sig: 'velocity(port)', d: 'Velocidade atual em graus por segundo.', r: 'int' },
      { n: 'get_duty_cycle', sig: 'get_duty_cycle(port)', d: 'Potência aplicada no momento (-10000 a 10000).', r: 'int' },
      { n: 'READY', c: 0, d: 'resultado: terminou normalmente' }, { n: 'RUNNING', c: 1, d: 'resultado: ainda em execução' },
      { n: 'STALLED', c: 2, d: 'resultado: travou (bloqueado)' }, { n: 'CANCELLED', c: 3, d: 'resultado: outro comando substituiu' },
      { n: 'ERROR', c: 4, d: 'resultado: erro' }, { n: 'DISCONNECTED', c: 5, d: 'resultado: motor desconectado' },
      { n: 'COAST', c: 0, d: 'parada: solta o motor' }, { n: 'BRAKE', c: 1, d: 'parada: freia (padrão)' }, { n: 'HOLD', c: 2, d: 'parada: segura a posição com força' },
      { n: 'CONTINUE', c: 3, d: 'parada: continua girando' }, { n: 'SMART_COAST', c: 4, d: 'parada: solta lembrando o alvo' }, { n: 'SMART_BRAKE', c: 5, d: 'parada: freia lembrando o alvo' },
      { n: 'CLOCKWISE', c: 0, d: 'direção: horário' }, { n: 'COUNTERCLOCKWISE', c: 1, d: 'direção: anti-horário' },
      { n: 'SHORTEST_PATH', c: 2, d: 'direção: caminho mais curto' }, { n: 'LONGEST_PATH', c: 3, d: 'direção: caminho mais longo' },
    ],
  },
  {
    mod: 'motor_pair', imp: 'import motor_pair', desc: 'Dois motores de tração sincronizados (esquerdo e direito). O motor esquerdo é invertido automaticamente para que velocidade positiva seja para a frente. steering: 0 reto, 50 gira sobre uma roda, 100 gira no lugar (positivo vira à direita).',
    items: [
      { n: 'pair', sig: 'pair(pair, left_motor, right_motor)', d: 'Configura o par. Ex.: motor_pair.pair(motor_pair.PAIR_1, port.A, port.B).' },
      { n: 'unpair', sig: 'unpair(pair)', d: 'Desfaz o par.' },
      { n: 'move', sig: 'move(pair, steering, *, velocity=360, acceleration=1000)', d: 'Anda sem parar com a direção dada.' },
      { n: 'move_for_degrees', sig: 'move_for_degrees(pair, degrees, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Anda um número de graus do motor mais rápido. Distância (mm) = graus / 360 x pi x diâmetro da roda.', r: 'Awaitable' },
      { n: 'move_for_time', sig: 'move_for_time(pair, duration, steering, *, velocity=360, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Anda por duration milissegundos.', r: 'Awaitable' },
      { n: 'move_tank', sig: 'move_tank(pair, left_velocity, right_velocity, *, acceleration=1000)', d: 'Velocidade de cada roda separada (tanque).' },
      { n: 'move_tank_for_degrees', sig: 'move_tank_for_degrees(pair, degrees, left_velocity, right_velocity, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Tanque por um número de graus (do motor mais rápido).', r: 'Awaitable' },
      { n: 'move_tank_for_time', sig: 'move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=motor.BRAKE, acceleration=1000, deceleration=1000)', d: 'Tanque por duration milissegundos.', r: 'Awaitable' },
      { n: 'stop', sig: 'stop(pair, *, stop=motor.BRAKE)', d: 'Para os dois motores.' },
      { n: 'PAIR_1', c: 0, d: 'par 1' }, { n: 'PAIR_2', c: 1, d: 'par 2' }, { n: 'PAIR_3', c: 2, d: 'par 3' },
    ],
  },
  {
    mod: 'color_sensor', imp: 'import color_sensor', desc: 'Sensor de cor apontado para o tapete. Funciona melhor de 8 a 16 mm de altura.',
    items: [
      { n: 'color', sig: 'color(port)', d: 'Cor detectada (constantes do módulo color, -1 se nada).', r: 'int' },
      { n: 'reflection', sig: 'reflection(port)', d: 'Luz refletida de 0 a 100%. Preto fica perto de 10, branco perto de 100.', r: 'int' },
      { n: 'rgbi', sig: 'rgbi(port)', d: 'Vermelho, verde, azul e intensidade (0 a 1024).', r: 'tuple' },
    ],
  },
  {
    mod: 'distance_sensor', imp: 'import distance_sensor', desc: 'Sensor ultrassônico: mede de 4 a 200 cm. Devolve -1 quando não vê nada.',
    items: [
      { n: 'distance', sig: 'distance(port)', d: 'Distância em milímetros (-1 se nada).', r: 'int' },
      { n: 'show', sig: 'show(port, pixels)', d: 'Acende as 4 luzes em volta dos "olhos" (lista de 4 brilhos 0 a 100).' },
      { n: 'set_pixel', sig: 'set_pixel(port, x, y, intensity)', d: 'Uma das 4 luzes (x e y de 0 a 1).' },
      { n: 'get_pixel', sig: 'get_pixel(port, x, y)', d: 'Brilho de uma luz.', r: 'int' },
      { n: 'clear', sig: 'clear(port)', d: 'Apaga as luzes.' },
    ],
  },
  {
    mod: 'force_sensor', imp: 'import force_sensor', desc: 'Botão que mede força (0 a 10 N).',
    items: [
      { n: 'force', sig: 'force(port)', d: 'Força em decinewtons (0 a 100).', r: 'int' },
      { n: 'pressed', sig: 'pressed(port)', d: 'True se o botão está apertado.', r: 'bool' },
      { n: 'raw', sig: 'raw(port)', d: 'Leitura bruta, sem calibração.', r: 'int' },
    ],
  },
  {
    mod: 'color', imp: 'import color', desc: 'Constantes de cor usadas pelo sensor e pelas luzes.',
    items: ['BLACK:0', 'MAGENTA:1', 'PURPLE:2', 'BLUE:3', 'AZURE:4', 'TURQUOISE:5', 'GREEN:6', 'YELLOW:7', 'ORANGE:8', 'RED:9', 'WHITE:10', 'UNKNOWN:-1']
      .map(s => { const [n, c] = s.split(':'); return { n, c: +c, d: 'cor' }; }),
  },
  {
    mod: 'hub', imp: 'import hub', desc: 'O hub e seus módulos internos (port, light_matrix, motion_sensor, button, light, sound).',
    items: [
      { n: 'port', sub: true, d: 'constantes das portas A a F' }, { n: 'light_matrix', sub: true, d: 'matriz de luz 5x5' },
      { n: 'motion_sensor', sub: true, d: 'giroscópio e acelerômetro' }, { n: 'button', sub: true, d: 'botões esquerdo e direito' },
      { n: 'light', sub: true, d: 'luz do botão central e do Bluetooth' }, { n: 'sound', sub: true, d: 'alto-falante' },
      { n: 'temperature', sig: 'temperature()', d: 'Temperatura em décimos de grau Celsius.', r: 'int' },
      { n: 'device_uuid', sig: 'device_uuid()', d: 'Identificador do hub.', r: 'str' },
      { n: 'hardware_id', sig: 'hardware_id()', d: 'Identificador do hardware.', r: 'str' },
      { n: 'power_off', sig: 'power_off()', d: 'Desliga o hub (encerra o programa).' },
    ],
  },
  { mod: 'port', imp: 'from hub import port', desc: 'Portas do hub.', items: 'ABCDEF'.split('').map((L, i) => ({ n: L, c: i, d: 'porta ' + L })) },
  {
    mod: 'light_matrix', imp: 'from hub import light_matrix', desc: 'Matriz 5x5 de luzes brancas. x = coluna (0 a 4), y = linha (0 a 4), brilho 0 a 100.',
    items: [
      { n: 'write', sig: 'write(text, intensity=100, time_per_character=500)', d: 'Escreve texto rolando. Um caractere só fica parado.', r: 'Awaitable' },
      { n: 'show_image', sig: 'show_image(image)', d: 'Mostra uma imagem pronta (light_matrix.IMAGE_HEART etc.).' },
      { n: 'show', sig: 'show(pixels)', d: 'Lista de 25 brilhos, linha por linha.' },
      { n: 'set_pixel', sig: 'set_pixel(x, y, intensity)', d: 'Acende um ponto.' },
      { n: 'get_pixel', sig: 'get_pixel(x, y)', d: 'Brilho de um ponto.', r: 'int' },
      { n: 'clear', sig: 'clear()', d: 'Apaga tudo.' },
      { n: 'set_orientation', sig: 'set_orientation(top)', d: 'Gira a imagem (orientation.UP, RIGHT, DOWN, LEFT).' },
      { n: 'get_orientation', sig: 'get_orientation()', d: 'Orientação atual.', r: 'int' },
      ...['HEART', 'HEART_SMALL', 'HAPPY', 'SMILE', 'SAD', 'CONFUSED', 'ANGRY', 'ASLEEP', 'SURPRISED', 'SILLY', 'FABULOUS', 'MEH', 'YES', 'NO',
        'ARROW_N', 'ARROW_E', 'ARROW_S', 'ARROW_W', 'GO_UP', 'GO_DOWN', 'GO_LEFT', 'GO_RIGHT', 'TRIANGLE', 'DIAMOND', 'SQUARE', 'CHESSBOARD',
        'TARGET', 'SKULL', 'GHOST', 'DUCK', 'HOUSE', 'TORTOISE', 'RABBIT', 'SNAKE', 'PACMAN', 'MUSIC_QUAVER'].map(n => ({ n: 'IMAGE_' + n, d: 'imagem' })),
    ],
  },
  {
    mod: 'motion_sensor', imp: 'from hub import motion_sensor', desc: 'Sensor de movimento (giroscópio de 3 eixos e acelerômetro). Ângulos em décimos de grau: 900 = 90°. Guinada (yaw) positiva é anti-horária: virar à direita diminui o valor.',
    items: [
      { n: 'tilt_angles', sig: 'tilt_angles()', d: '(yaw, pitch, roll) em décimos de grau.', r: 'tuple' },
      { n: 'reset_yaw', sig: 'reset_yaw(angle)', d: 'Define o valor atual da guinada (normalmente 0).' },
      { n: 'angular_velocity', sig: 'angular_velocity(raw_unfiltered=False)', d: 'Velocidade de giro (x, y, z) em décimos de grau por segundo.', r: 'tuple' },
      { n: 'acceleration', sig: 'acceleration(raw_unfiltered=False)', d: 'Aceleração (x, y, z) em milésimos de g.', r: 'tuple' },
      { n: 'set_yaw_face', sig: 'set_yaw_face(up)', d: 'Face do hub que fica para cima (para hub montado de lado).', r: 'bool' },
      { n: 'get_yaw_face', sig: 'get_yaw_face()', d: 'Face de guinada atual.', r: 'int' },
      { n: 'up_face', sig: 'up_face()', d: 'Face que está para cima agora.', r: 'int' },
      { n: 'gesture', sig: 'gesture()', d: 'Último gesto: TAPPED, DOUBLE_TAPPED, SHAKEN, FALLING ou -1.', r: 'int' },
      { n: 'tap_count', sig: 'tap_count()', d: 'Quantas batidas foram detectadas.', r: 'int' },
      { n: 'reset_tap_count', sig: 'reset_tap_count()', d: 'Zera o contador de batidas.' },
      { n: 'stable', sig: 'stable()', d: 'True se o hub está parado.', r: 'bool' },
      { n: 'quaternion', sig: 'quaternion()', d: 'Orientação como quatérnio (w, x, y, z).', r: 'tuple' },
      ...['TAPPED:0', 'DOUBLE_TAPPED:1', 'SHAKEN:2', 'FALLING:3', 'UNKNOWN:-1', 'TOP:0', 'FRONT:1', 'RIGHT:2', 'BOTTOM:3', 'BACK:4', 'LEFT:5']
        .map(s => { const [n, c] = s.split(':'); return { n, c: +c, d: n.length > 6 ? 'gesto' : 'face' }; }),
    ],
  },
  {
    mod: 'button', imp: 'from hub import button', desc: 'Botões do hub. O botão central é reservado: ele inicia e para o programa.',
    items: [
      { n: 'pressed', sig: 'pressed(button)', d: 'Há quantos milissegundos o botão está apertado (0 se solto).', r: 'int' },
      { n: 'LEFT', c: 1, d: 'botão esquerdo' }, { n: 'RIGHT', c: 2, d: 'botão direito' },
    ],
  },
  {
    mod: 'light', imp: 'from hub import light', desc: 'Luzes do hub.',
    items: [
      { n: 'color', sig: 'color(light, color)', d: 'Muda a cor. Ex.: light.color(light.POWER, color.RED).' },
      { n: 'POWER', c: 0, d: 'anel do botão central' }, { n: 'CONNECT', c: 1, d: 'luz do Bluetooth' },
    ],
  },
  {
    mod: 'sound', imp: 'from hub import sound', desc: 'Alto-falante do hub.',
    items: [
      { n: 'beep', sig: 'beep(freq=440, duration=500, volume=100)', d: 'Toca um bipe (frequência em Hz, duração em ms).', r: 'Awaitable' },
      { n: 'stop', sig: 'stop()', d: 'Para o som.' },
      { n: 'volume', sig: 'volume(volume)', d: 'Volume de 0 a 100.' },
      { n: 'WAVEFORM_SINE', c: 1, d: 'onda senoidal' }, { n: 'WAVEFORM_SQUARE', c: 2, d: 'onda quadrada' },
      { n: 'WAVEFORM_SAWTOOTH', c: 3, d: 'dente de serra' }, { n: 'WAVEFORM_TRIANGLE', c: 4, d: 'triangular' },
    ],
  },
  {
    mod: 'device', imp: 'import device', desc: 'Acesso genérico a qualquer dispositivo.',
    items: [
      { n: 'id', sig: 'id(port)', d: 'Tipo do dispositivo: 48 motor médio, 49 grande, 65 pequeno, 61 cor, 62 distância, 63 força.', r: 'int' },
      { n: 'ready', sig: 'ready(port)', d: 'True se há algo conectado.', r: 'bool' },
      { n: 'data', sig: 'data(port)', d: 'Dados brutos do modo atual.', r: 'tuple' },
      { n: 'get_duty_cycle', sig: 'get_duty_cycle(port)', d: 'Potência de um motor.', r: 'int' },
      { n: 'set_duty_cycle', sig: 'set_duty_cycle(port, duty_cycle)', d: 'Potência direta de um motor.' },
    ],
  },
  { mod: 'orientation', imp: 'import orientation', desc: 'Orientação da matriz de luz.', items: ['UP:0', 'RIGHT:1', 'DOWN:2', 'LEFT:3'].map(s => { const [n, c] = s.split(':'); return { n, c: +c, d: 'orientação' }; }) },
  {
    mod: 'app', imp: 'from app import linegraph, bargraph, display, sound, music', desc: 'Recursos que aparecem no computador (aba DADOS): gráfico de linha, barras, tela e sons.',
    items: [
      { n: 'linegraph', sub: true, d: 'plot(color, x, y), show(), clear_all(), get_average(color)...' },
      { n: 'bargraph', sub: true, d: 'set_value(color, value), change(color, value), show()...' },
      { n: 'display', sub: true, d: 'text(texto), image(n), show(), hide()' },
      { n: 'sound', sub: true, d: 'play(nome) toca um efeito' },
      { n: 'music', sub: true, d: 'play_drum(), play_instrument()' },
    ],
  },
  {
    mod: 'linegraph', imp: 'from app import linegraph', desc: 'Gráfico de linha na aba DADOS.',
    items: [
      { n: 'plot', sig: 'plot(color, x, y)', d: 'Acrescenta um ponto na linha da cor.' }, { n: 'show', sig: 'show(fullscreen)', d: 'Mostra o gráfico.' },
      { n: 'hide', sig: 'hide()', d: 'Esconde.' }, { n: 'clear', sig: 'clear(color)', d: 'Apaga uma linha.' }, { n: 'clear_all', sig: 'clear_all()', d: 'Apaga tudo.' },
      { n: 'get_average', sig: 'get_average(color)', d: 'Média (aguardável).', r: 'Awaitable' }, { n: 'get_last', sig: 'get_last(color)', d: 'Último valor.', r: 'Awaitable' },
      { n: 'get_max', sig: 'get_max(color)', d: 'Máximo.', r: 'Awaitable' }, { n: 'get_min', sig: 'get_min(color)', d: 'Mínimo.', r: 'Awaitable' },
    ],
  },
  {
    mod: 'bargraph', imp: 'from app import bargraph', desc: 'Gráfico de barras na aba DADOS.',
    items: [
      { n: 'set_value', sig: 'set_value(color, value)', d: 'Define a barra.' }, { n: 'change', sig: 'change(color, value)', d: 'Soma ao valor.' },
      { n: 'get_value', sig: 'get_value(color)', d: 'Valor (aguardável).', r: 'Awaitable' }, { n: 'show', sig: 'show(fullscreen)', d: 'Mostra.' },
      { n: 'hide', sig: 'hide()', d: 'Esconde.' }, { n: 'clear_all', sig: 'clear_all()', d: 'Zera.' },
    ],
  },
  {
    mod: 'time', imp: 'import time', desc: 'Tempo do MicroPython. time.sleep bloqueia; prefira await runloop.sleep_ms().',
    items: [
      { n: 'ticks_ms', sig: 'ticks_ms()', d: 'Milissegundos desde que o hub ligou.', r: 'int' },
      { n: 'ticks_us', sig: 'ticks_us()', d: 'Microssegundos.', r: 'int' },
      { n: 'ticks_diff', sig: 'ticks_diff(a, b)', d: 'Diferença a - b entre dois ticks.', r: 'int' },
      { n: 'sleep_ms', sig: 'sleep_ms(ms)', d: 'Espera bloqueando.' }, { n: 'sleep', sig: 'sleep(s)', d: 'Espera em segundos.' },
    ],
  },
];

// ------------------------------------------------------------------ Pybricks
export const PB_API = [
  {
    mod: 'PrimeHub', imp: 'from pybricks.hubs import PrimeHub', desc: 'O hub. hub = PrimeHub(). Tem display, light, buttons, speaker, imu, battery e system.',
    items: [
      { n: 'display', sub: true, d: 'matriz 5x5: icon, number, char, text, pixel, off' }, { n: 'light', sub: true, d: 'luz do botão: on, off, blink' },
      { n: 'buttons', sub: true, d: 'pressed() devolve os botões apertados' }, { n: 'speaker', sub: true, d: 'beep, play_notes, volume' },
      { n: 'imu', sub: true, d: 'heading, reset_heading, tilt, acceleration, angular_velocity' }, { n: 'battery', sub: true, d: 'voltage, current' },
      { n: 'system', sub: true, d: 'set_stop_button, name' },
    ],
  },
  {
    mod: 'display', imp: 'hub.display', desc: 'Matriz de luz do PrimeHub.',
    items: [
      { n: 'icon', sig: 'icon(icon)', d: 'Mostra um ícone (Icon.HEART...).' }, { n: 'number', sig: 'number(number)', d: 'Mostra um número de -99 a 99.' },
      { n: 'char', sig: 'char(char)', d: 'Mostra um caractere.' }, { n: 'text', sig: 'text(text, on=500, off=50)', d: 'Rola um texto (bloqueia).' },
      { n: 'pixel', sig: 'pixel(row, column, brightness=100)', d: 'Um ponto (linha, coluna).' }, { n: 'off', sig: 'off()', d: 'Apaga.' },
      { n: 'orientation', sig: 'orientation(up)', d: 'Lado de cima (Side.TOP, Side.LEFT...).' },
    ],
  },
  { mod: 'light', imp: 'hub.light', desc: 'Luz do botão central.', items: [{ n: 'on', sig: 'on(color)', d: 'Liga com uma cor (Color.RED).' }, { n: 'off', sig: 'off()', d: 'Desliga.' }, { n: 'blink', sig: 'blink(color, durations)', d: 'Pisca (lista de ms ligado/desligado).' }] },
  { mod: 'buttons', imp: 'hub.buttons', desc: 'Botões.', items: [{ n: 'pressed', sig: 'pressed()', d: 'Conjunto dos botões apertados: Button.LEFT in hub.buttons.pressed().', r: 'set' }] },
  { mod: 'speaker', imp: 'hub.speaker', desc: 'Alto-falante.', items: [{ n: 'beep', sig: 'beep(frequency=500, duration=100)', d: 'Bipe (bloqueia).' }, { n: 'play_notes', sig: 'play_notes(notes, tempo=120)', d: "Notas como ['C4/4', 'E4/4']." }, { n: 'volume', sig: 'volume(volume)', d: 'Volume 0 a 100.' }] },
  {
    mod: 'imu', imp: 'hub.imu', desc: 'Giroscópio. heading() positivo é horário (virar à direita aumenta).',
    items: [
      { n: 'heading', sig: 'heading()', d: 'Direção em graus desde o início ou reset.', r: 'float' }, { n: 'reset_heading', sig: 'reset_heading(angle)', d: 'Define a direção atual.' },
      { n: 'tilt', sig: 'tilt()', d: '(pitch, roll) em graus.', r: 'tuple' }, { n: 'acceleration', sig: 'acceleration(axis=None)', d: 'Aceleração em mm/s².' },
      { n: 'angular_velocity', sig: 'angular_velocity(axis=None)', d: 'Giro em graus/s.' }, { n: 'up', sig: 'up()', d: 'Lado para cima (Side).' },
      { n: 'ready', sig: 'ready()', d: 'Calibrado e pronto.', r: 'bool' }, { n: 'stationary', sig: 'stationary()', d: 'Parado.', r: 'bool' },
    ],
  },
  {
    mod: 'Motor', imp: 'from pybricks.pupdevices import Motor', desc: 'motor = Motor(Port.A, Direction.CLOCKWISE). Velocidade em graus/s, ângulos em graus. Comandos com wait=True bloqueiam.',
    items: [
      { n: 'angle', sig: 'angle()', d: 'Ângulo em graus.', r: 'int' }, { n: 'speed', sig: 'speed()', d: 'Velocidade em graus/s.', r: 'int' },
      { n: 'reset_angle', sig: 'reset_angle(angle=None)', d: 'Define o ângulo (sem valor: usa a posição absoluta).' },
      { n: 'run', sig: 'run(speed)', d: 'Gira sem parar.' }, { n: 'stop', sig: 'stop()', d: 'Solta (coast).' }, { n: 'brake', sig: 'brake()', d: 'Freia.' }, { n: 'hold', sig: 'hold()', d: 'Segura a posição.' },
      { n: 'run_time', sig: 'run_time(speed, time, then=Stop.HOLD, wait=True)', d: 'Gira por time ms.' },
      { n: 'run_angle', sig: 'run_angle(speed, rotation_angle, then=Stop.HOLD, wait=True)', d: 'Gira um ângulo.' },
      { n: 'run_target', sig: 'run_target(speed, target_angle, then=Stop.HOLD, wait=True)', d: 'Vai até um ângulo.' },
      { n: 'run_until_stalled', sig: 'run_until_stalled(speed, then=Stop.COAST, duty_limit=None)', d: 'Gira até travar e devolve o ângulo.', r: 'int' },
      { n: 'dc', sig: 'dc(duty)', d: 'Potência direta em % (-100 a 100).' }, { n: 'track_target', sig: 'track_target(target_angle)', d: 'Segue um alvo que muda sempre.' },
      { n: 'done', sig: 'done()', d: 'True se o comando terminou.', r: 'bool' }, { n: 'stalled', sig: 'stalled()', d: 'True se está travado.', r: 'bool' },
      { n: 'load', sig: 'load()', d: 'Carga estimada em mNm.', r: 'int' },
    ],
  },
  {
    mod: 'DriveBase', imp: 'from pybricks.robotics import DriveBase', desc: 'robo = DriveBase(motor_esq, motor_dir, wheel_diameter=56, axle_track=136). Distâncias em mm, ângulos em graus (positivo vira à direita).',
    items: [
      { n: 'straight', sig: 'straight(distance, then=Stop.HOLD, wait=True)', d: 'Anda reto distance mm (negativo para trás).' },
      { n: 'turn', sig: 'turn(angle, then=Stop.HOLD, wait=True)', d: 'Gira no lugar (positivo = direita).' },
      { n: 'curve', sig: 'curve(radius, angle, then=Stop.HOLD, wait=True)', d: 'Faz uma curva de raio dado.' },
      { n: 'arc', sig: 'arc(radius, angle=None, distance=None, then=Stop.HOLD, wait=True)', d: 'Arco por ângulo ou distância.' },
      { n: 'drive', sig: 'drive(speed, turn_rate)', d: 'Anda sem parar (mm/s e graus/s).' },
      { n: 'stop', sig: 'stop()', d: 'Solta os motores.' }, { n: 'brake', sig: 'brake()', d: 'Freia.' },
      { n: 'distance', sig: 'distance()', d: 'Distância percorrida (mm).', r: 'int' }, { n: 'angle', sig: 'angle()', d: 'Ângulo girado (graus).', r: 'int' },
      { n: 'state', sig: 'state()', d: '(distância, velocidade, ângulo, taxa de giro).', r: 'tuple' },
      { n: 'reset', sig: 'reset(distance=0, angle=0)', d: 'Zera distância e ângulo.' },
      { n: 'settings', sig: 'settings(straight_speed, straight_acceleration, turn_rate, turn_acceleration)', d: 'Velocidades e acelerações padrão.' },
      { n: 'use_gyro', sig: 'use_gyro(use_gyro)', d: 'True: usa o giroscópio para manter a direção.' },
      { n: 'done', sig: 'done()', d: 'True se terminou.', r: 'bool' }, { n: 'stalled', sig: 'stalled()', d: 'True se travou.', r: 'bool' },
    ],
  },
  {
    mod: 'ColorSensor', imp: 'from pybricks.pupdevices import ColorSensor', desc: 'sensor = ColorSensor(Port.C).',
    items: [
      { n: 'color', sig: 'color(surface=True)', d: 'Cor (Color.RED, Color.NONE...).', r: 'Color' }, { n: 'reflection', sig: 'reflection()', d: 'Reflexão 0 a 100%.', r: 'int' },
      { n: 'ambient', sig: 'ambient()', d: 'Luz ambiente 0 a 100%.', r: 'int' }, { n: 'hsv', sig: 'hsv(surface=True)', d: 'Matiz, saturação e valor.', r: 'Color' },
      { n: 'detectable_colors', sig: 'detectable_colors(colors)', d: 'Lista de cores que color() pode devolver.' },
    ],
  },
  {
    mod: 'UltrasonicSensor', imp: 'from pybricks.pupdevices import UltrasonicSensor', desc: 'olhos = UltrasonicSensor(Port.F).',
    items: [
      { n: 'distance', sig: 'distance()', d: 'Distância em mm (2000 se não vê nada).', r: 'int' }, { n: 'presence', sig: 'presence()', d: 'Outro sensor ultrassônico por perto.', r: 'bool' },
      { n: 'lights', sub: true, d: 'lights.on(brilho) e lights.off()' },
    ],
  },
  {
    mod: 'ForceSensor', imp: 'from pybricks.pupdevices import ForceSensor', desc: 'botao = ForceSensor(Port.E).',
    items: [
      { n: 'force', sig: 'force()', d: 'Força em newtons.', r: 'float' }, { n: 'distance', sig: 'distance()', d: 'Quanto o botão afundou (mm).', r: 'float' },
      { n: 'pressed', sig: 'pressed(force=3)', d: 'True acima da força dada (N).', r: 'bool' }, { n: 'touched', sig: 'touched()', d: 'True ao menor toque.', r: 'bool' },
    ],
  },
  {
    mod: 'tools', imp: 'from pybricks.tools import wait, StopWatch, multitask, run_task, hub_menu', desc: 'Ferramentas.',
    items: [
      { n: 'wait', sig: 'wait(time)', d: 'Espera time ms.' }, { n: 'StopWatch', sig: 'StopWatch()', d: 'Cronômetro: time(), reset(), pause(), resume().' },
      { n: 'multitask', sig: 'multitask(*tasks, race=False)', d: 'Roda tarefas async juntas (use com await).' },
      { n: 'run_task', sig: 'run_task(task)', d: 'Executa uma função async principal.' },
      { n: 'hub_menu', sig: "hub_menu('1', '2', '3')", d: 'Menu na matriz: botões escolhem, centro confirma. Devolve o escolhido.' },
    ],
  },
  { mod: 'Port', imp: 'from pybricks.parameters import Port', desc: 'Portas.', items: 'ABCDEF'.split('').map(L => ({ n: L, d: 'porta ' + L })) },
  { mod: 'Direction', imp: 'from pybricks.parameters import Direction', desc: 'Sentido positivo do motor.', items: [{ n: 'CLOCKWISE', d: 'horário' }, { n: 'COUNTERCLOCKWISE', d: 'anti-horário' }] },
  { mod: 'Stop', imp: 'from pybricks.parameters import Stop', desc: 'O que fazer ao terminar.', items: [{ n: 'COAST', d: 'solta' }, { n: 'BRAKE', d: 'freia' }, { n: 'HOLD', d: 'segura' }, { n: 'NONE', d: 'segue para o próximo sem parar' }, { n: 'COAST_SMART', d: 'solta lembrando o alvo' }] },
  { mod: 'Color', imp: 'from pybricks.parameters import Color', desc: 'Cores.', items: ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'CYAN', 'BLUE', 'VIOLET', 'MAGENTA', 'WHITE', 'GRAY', 'BLACK', 'NONE'].map(n => ({ n, d: 'cor' })) },
  { mod: 'Button', imp: 'from pybricks.parameters import Button', desc: 'Botões.', items: [{ n: 'LEFT', d: 'esquerdo' }, { n: 'RIGHT', d: 'direito' }, { n: 'CENTER', d: 'central' }, { n: 'BLUETOOTH', d: 'Bluetooth' }] },
  { mod: 'Icon', imp: 'from pybricks.parameters import Icon', desc: 'Ícones para hub.display.icon().', items: ['HEART', 'HAPPY', 'SAD', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'ARROW_UP', 'ARROW_DOWN', 'ARROW_LEFT', 'ARROW_RIGHT', 'SQUARE', 'CIRCLE', 'TRUE', 'FALSE', 'EMPTY', 'FULL', 'PAUSE', 'CLOCKWISE', 'COUNTERCLOCKWISE'].map(n => ({ n, d: 'ícone' })) },
  { mod: 'Axis', imp: 'from pybricks.parameters import Axis', desc: 'Eixos do hub.', items: [{ n: 'X', d: 'frente' }, { n: 'Y', d: 'esquerda' }, { n: 'Z', d: 'cima' }] },
  { mod: 'Side', imp: 'from pybricks.parameters import Side', desc: 'Lados do hub.', items: ['TOP', 'BOTTOM', 'FRONT', 'BACK', 'LEFT', 'RIGHT'].map(n => ({ n, d: 'lado' })) },
];

const KEYWORDS = 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ');
const BUILTINS = 'print range len int float str bool list dict tuple set abs min max round sum sorted enumerate zip map filter isinstance'.split(' ');

function index(api) {
  const m = {};
  for (const g of api) m[g.mod] = g.items;
  return m;
}
const SIDX = index(SPIKE_API), PIDX = index(PB_API);

// autocompletar: obj = texto antes do ponto, pre = prefixo digitado
export function complete(obj, pre, src, dialect) {
  const idx = dialect === 'pybricks' ? PIDX : SIDX;
  const mk = (it) => ({ name: it.n, hint: it.sig ? it.sig.replace(it.n, '').slice(0, 34) : (it.c !== undefined ? '= ' + it.c : (it.d || '')), insert: it.sig ? it.n + '()' : it.n, cursorBack: it.sig ? 1 : 0 });
  const filt = (arr) => arr.filter(it => it.n.toLowerCase().startsWith(pre.toLowerCase())).map(mk);
  if (obj) {
    let key = obj.split('.').pop();
    if (dialect === 'pybricks') {
      // tipo inferido por atribuição: x = Motor(...)
      const re = new RegExp('\\b' + obj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(\\w+)\\s*\\(');
      const m = src.match(re);
      if (m && PIDX[m[1]]) key = m[1];
      else if (/^(hub|prime|h)$/.test(obj)) key = 'PrimeHub';
      else if (/\.(display|light|buttons|speaker|imu|battery)$/.test(obj)) key = obj.split('.').pop();
    } else if (key === 'hub' && obj.includes('.')) key = 'hub';
    const items = idx[key];
    if (items) return filt(items);
    return [];
  }
  const words = new Set();
  const out = [];
  for (const k of KEYWORDS) if (k.startsWith(pre)) out.push({ name: k, hint: 'palavra-chave' });
  for (const k of BUILTINS) if (k.startsWith(pre)) out.push({ name: k, hint: 'função', insert: k + '()', cursorBack: 1 });
  for (const k in idx) if (k.startsWith(pre)) out.push({ name: k, hint: 'módulo' });
  for (const m of src.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{2,})\b/g)) words.add(m[1]);
  for (const w of words) if (w.startsWith(pre) && w !== pre && !out.some(o => o.name === w)) out.push({ name: w, hint: '' });
  return out.slice(0, 40);
}

export { PORT_NOTE };
