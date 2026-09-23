// ============================================================================
//  MyFLL.lab :: examples.js
//  Programas prontos (SPIKE 3 e Pybricks) para a "Base de competição":
//  rodas A (esquerda) e B (direita), cor C e D, braço E, distância F.
// ============================================================================

export const STARTER = `# Bem-vindo ao MyFLL.lab!
# Este é o mesmo Python do hub SPIKE Prime (app SPIKE 3).
# Clique em ▶ EXECUTAR (ou Ctrl+Enter) para mandar ao hub.

from hub import light_matrix, port, sound
import motor_pair, runloop

# rodas de 56 mm: uma volta do motor (360 graus) anda 176 mm
async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)
    await light_matrix.write('Oi')
    await sound.beep(880, 150, 80)

    # anda 360 graus para a frente
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 360, 0, velocity=400)

    # gira no lugar para a direita (steering 100)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 219, 100, velocity=300)

    light_matrix.show_image(light_matrix.IMAGE_HAPPY)
    await runloop.sleep_ms(1000)

runloop.run(main())
`;

const HEAD = `from hub import light_matrix, port, motion_sensor, button, sound, light
import motor, motor_pair, color_sensor, distance_sensor, color, runloop
`;

export const EXAMPLES = [
  {
    group: 'Primeiros passos', title: 'Olá, hub', dialect: 'spike', tags: ['matriz', 'som', 'luz'],
    desc: 'Escreve na matriz de luz, mostra uma imagem, muda a cor do botão central e toca bipes.',
    code: `from hub import light_matrix, light, sound
import color, runloop

async def main():
    light.color(light.POWER, color.GREEN)
    await light_matrix.write('Oi!')
    light_matrix.show_image(light_matrix.IMAGE_HAPPY)
    await sound.beep(660, 200, 80)
    await sound.beep(880, 300, 80)
    # acende um ponto por vez
    light_matrix.clear()
    for y in range(5):
        for x in range(5):
            light_matrix.set_pixel(x, y, 100)
            await runloop.sleep_ms(40)
    await runloop.sleep_ms(800)

runloop.run(main())
`,
  },
  {
    group: 'Primeiros passos', title: 'Andar, virar e voltar', dialect: 'spike', tags: ['motor_pair', 'graus'],
    desc: 'move_for_degrees com steering 0 (reto) e 100 (gira no lugar). Graus negativos andam de ré.',
    code: `from hub import port
import motor_pair, runloop

PAR = motor_pair.PAIR_1

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    await motor_pair.move_for_degrees(PAR, 720, 0, velocity=500)    # ~352 mm para a frente
    await motor_pair.move_for_degrees(PAR, 219, -100, velocity=300) # 90 graus para a esquerda
    await motor_pair.move_for_degrees(PAR, 360, 0, velocity=500)
    await motor_pair.move_for_degrees(PAR, 219, 100, velocity=300)  # 90 graus para a direita
    await motor_pair.move_for_degrees(PAR, -720, 0, velocity=400)   # ré

runloop.run(main())
`,
  },
  {
    group: 'Primeiros passos', title: 'Quadrado com laço e funções', dialect: 'spike', tags: ['for', 'def', 'mm'],
    desc: 'Converte milímetros em graus da roda e usa um laço para desenhar um quadrado de 40 cm na trilha.',
    code: `from hub import port
import motor_pair, runloop

PAR = motor_pair.PAIR_1
DIAMETRO = 56      # mm (roda)
BITOLA = 136       # mm (distância entre as rodas)

def graus(mm):
    # graus do motor para andar "mm" milímetros
    return int(mm * 360 / (3.1416 * DIAMETRO))

def graus_giro(angulo):
    # cada roda percorre um arco de raio BITOLA/2
    return int(angulo * BITOLA / DIAMETRO)

async def reto(mm, vel=450):
    await motor_pair.move_for_degrees(PAR, graus(mm), 0, velocity=vel)

async def esquerda(angulo, vel=250):
    # steering -100: gira no lugar para a esquerda
    await motor_pair.move_for_degrees(PAR, graus_giro(angulo), -100, velocity=vel)

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    for lado in range(4):
        await reto(400)
        await esquerda(90)
    print('Terminei! Compare o fim com o começo na trilha laranja.')

runloop.run(main())
`,
  },
  {
    group: 'Sensores', title: 'Parar na linha preta', dialect: 'spike', tags: ['reflexão', 'until'],
    desc: 'Anda até o sensor de cor C ver preto (reflexão baixa). Funciona em qualquer tapete com linha preta à frente.',
    code: HEAD + `
PAR = motor_pair.PAIR_1

def viu_preto():
    return color_sensor.reflection(port.C) < 25

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    motor_pair.move(PAR, 0, velocity=300)
    await runloop.until(viu_preto)
    motor_pair.stop(PAR)
    await sound.beep(880, 150)
    print('Linha encontrada! reflexão =', color_sensor.reflection(port.C))

runloop.run(main())
`,
  },
  {
    group: 'Sensores', title: 'Seguidor de linha (proporcional)', dialect: 'spike', tags: ['P', 'linha'],
    desc: 'Segue a borda esquerda da linha com o sensor C. Use o tapete "Treino de linha" (aba MESA) com o robô no início.',
    code: HEAD + `
PAR = motor_pair.PAIR_1
ALVO = 55       # meio entre preto (~10) e branco (~100)
KP = 3          # ganho: aumente se o robô demora a corrigir
BASE = 260      # velocidade em graus/s

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    for passo in range(1500):          # cerca de 15 segundos
        erro = color_sensor.reflection(port.C) - ALVO
        correcao = int(KP * erro)
        motor_pair.move_tank(PAR, BASE + correcao, BASE - correcao)
        await runloop.sleep_ms(10)
    motor_pair.stop(PAR)

runloop.run(main())
`,
  },
  {
    group: 'Sensores', title: 'Seguidor de linha PID com dois sensores', dialect: 'spike', tags: ['PID', 'C e D'],
    desc: 'Usa a diferença entre os sensores C e D (um de cada lado da linha). O termo D amortece o zigue-zague.',
    code: HEAD + `
PAR = motor_pair.PAIR_1
KP, KI, KD = 2.2, 0.0, 9.0
BASE = 300

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    integral = 0
    anterior = 0
    for passo in range(2000):
        erro = color_sensor.reflection(port.C) - color_sensor.reflection(port.D)
        integral = integral + erro
        derivada = erro - anterior
        anterior = erro
        corr = int(KP * erro + KI * integral + KD * derivada)
        motor_pair.move_tank(PAR, BASE + corr, BASE - corr)
        await runloop.sleep_ms(10)
    motor_pair.stop(PAR)

runloop.run(main())
`,
  },
  {
    group: 'Sensores', title: 'Evitar obstáculos', dialect: 'spike', tags: ['distância'],
    desc: 'Anda até o sensor de distância (porta F) ver algo a menos de 15 cm, recua e gira.',
    code: HEAD + `
PAR = motor_pair.PAIR_1

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    for volta in range(6):
        motor_pair.move(PAR, 0, velocity=350)
        while True:
            d = distance_sensor.distance(port.F)
            if d != -1 and d < 150:
                break
            await runloop.sleep_ms(20)
        motor_pair.stop(PAR)
        light_matrix.show_image(light_matrix.IMAGE_SURPRISED)
        await motor_pair.move_for_degrees(PAR, -200, 0, velocity=300)
        await motor_pair.move_for_degrees(PAR, 219, 100, velocity=300)
        light_matrix.clear()

runloop.run(main())
`,
  },
  {
    group: 'Sensores', title: 'Mostrar leituras no console', dialect: 'spike', tags: ['print', 'calibrar'],
    desc: 'Imprime cor, reflexão, distância e guinada a cada meio segundo. Arraste o robô pela mesa para calibrar.',
    code: HEAD + `
NOMES = {0: 'preto', 1: 'magenta', 3: 'azul', 4: 'azul claro', 6: 'verde', 7: 'amarelo', 9: 'vermelho', 10: 'branco', -1: 'nada'}

async def main():
    for i in range(40):
        c = color_sensor.color(port.C)
        r = color_sensor.reflection(port.C)
        d = distance_sensor.distance(port.F)
        yaw = motion_sensor.tilt_angles()[0] / 10
        print('cor', NOMES.get(c, c), '| reflexão', r, '| distância', d, 'mm | yaw', yaw)
        await runloop.sleep_ms(500)

runloop.run(main())
`,
  },
  {
    group: 'Giroscópio', title: 'Giro preciso com o giroscópio', dialect: 'spike', tags: ['yaw', 'tilt_angles'],
    desc: 'Gira até o ângulo pedido lendo a guinada. No SPIKE 3 a guinada é anti-horária: virar à direita dá valores negativos.',
    code: HEAD + `
PAR = motor_pair.PAIR_1

async def girar(angulo):
    # angulo positivo = esquerda (anti-horário), em graus
    motion_sensor.reset_yaw(0)
    alvo = angulo * 10                       # decigraus
    while True:
        erro = alvo - motion_sensor.tilt_angles()[0]
        if abs(erro) < 8:
            break
        vel = max(70, min(350, abs(erro)))   # desacelera perto do alvo
        if erro > 0:
            motor_pair.move_tank(PAR, -vel, vel)
        else:
            motor_pair.move_tank(PAR, vel, -vel)
        await runloop.sleep_ms(5)
    motor_pair.stop(PAR, stop=motor.HOLD)
    await runloop.sleep_ms(150)
    print('girei', motion_sensor.tilt_angles()[0] / 10, 'graus')

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    await girar(90)
    await girar(-90)
    await girar(180)

runloop.run(main())
`,
  },
  {
    group: 'Giroscópio', title: 'Andar reto com o giroscópio', dialect: 'spike', tags: ['P', 'yaw', 'encoder'],
    desc: 'Corrige o desvio das rodas (que nunca são idênticas) usando a guinada. Compare a trilha com e sem correção.',
    code: HEAD + `
PAR = motor_pair.PAIR_1
DIAMETRO = 56

def graus(mm):
    return int(mm * 360 / (3.1416 * DIAMETRO))

async def reto_gyro(mm, vel=450, kp=0.6):
    motion_sensor.reset_yaw(0)
    motor.reset_relative_position(port.B, 0)
    alvo = graus(mm)
    while motor.relative_position(port.B) < alvo:
        desvio = motion_sensor.tilt_angles()[0]     # positivo = foi para a esquerda
        corr = int(desvio * kp)
        motor_pair.move_tank(PAR, vel + corr, vel - corr)
        await runloop.sleep_ms(10)
    motor_pair.stop(PAR)

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    await reto_gyro(1600)
    print('desvio final:', motion_sensor.tilt_angles()[0] / 10, 'graus')

runloop.run(main())
`,
  },
  {
    group: 'Acessórios', title: 'Braço frontal (motor E)', dialect: 'spike', tags: ['motor', 'HOLD'],
    desc: 'Baixa e levanta o braço, segura a posição com HOLD e mostra o contador do motor.',
    code: HEAD + `
BRACO = port.E

async def main():
    motor.reset_relative_position(BRACO, 0)
    # desce devagar até travar no chão (o comando termina como STALLED)
    r = await motor.run_for_degrees(BRACO, -150, 300, stop=motor.HOLD)
    print('desceu, resultado =', r, '(2 = travou)', 'posição', motor.relative_position(BRACO))
    await runloop.sleep_ms(500)
    await motor.run_for_degrees(BRACO, 90, 400, stop=motor.HOLD)
    print('subiu para', motor.relative_position(BRACO))
    await runloop.sleep_ms(500)
    await motor.run_to_relative_position(BRACO, 0, 300, stop=motor.HOLD)

runloop.run(main())
`,
  },
  {
    group: 'Acessórios', title: 'Duas coisas ao mesmo tempo', dialect: 'spike', tags: ['runloop.run', 'paralelo'],
    desc: 'Movimento sem await continua enquanto o programa segue; runloop.run também roda funções em paralelo.',
    code: HEAD + `
PAR = motor_pair.PAIR_1

async def anda():
    motor_pair.pair(PAR, port.A, port.B)
    # sem await: o braço sobe enquanto o robô já anda
    motor.run_for_degrees(port.E, 60, 300, stop=motor.HOLD)
    await motor_pair.move_for_degrees(PAR, 900, 0, velocity=400)

async def pisca():
    for i in range(10):
        light_matrix.show_image(light_matrix.IMAGE_HEART)
        await runloop.sleep_ms(200)
        light_matrix.show_image(light_matrix.IMAGE_HEART_SMALL)
        await runloop.sleep_ms(200)

runloop.run(anda(), pisca())
`,
  },
  {
    group: 'Estratégia FLL', title: 'Menu de saídas com os botões', dialect: 'spike', tags: ['button', 'menu'],
    desc: 'Um único programa com várias saídas: botão esquerdo escolhe, direito inicia. Assim a equipe não perde tempo trocando programa.',
    code: HEAD + `
PAR = motor_pair.PAIR_1

async def saida1():
    await motor_pair.move_for_degrees(PAR, 800, 0, velocity=500)
    await motor_pair.move_for_degrees(PAR, -800, 0, velocity=600)

async def saida2():
    await motor_pair.move_for_degrees(PAR, 500, 0, velocity=500)
    await motor_pair.move_for_degrees(PAR, 219, -100, velocity=300)
    await motor_pair.move_for_degrees(PAR, 400, 0, velocity=500)

async def saida3():
    await motor.run_for_degrees(port.E, 90, 400)
    await motor.run_for_degrees(port.E, -90, 400)

SAIDAS = [saida1, saida2, saida3]

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    escolha = 0
    while True:
        light_matrix.write(str(escolha + 1))
        if button.pressed(button.LEFT):
            escolha = (escolha + 1) % len(SAIDAS)
            await sound.beep(600, 60)
            while button.pressed(button.LEFT):
                await runloop.sleep_ms(10)
        if button.pressed(button.RIGHT):
            await sound.beep(1000, 120)
            await SAIDAS[escolha]()
            escolha = (escolha + 1) % len(SAIDAS)
        await runloop.sleep_ms(20)

runloop.run(main())
`,
  },
  {
    group: 'Estratégia FLL', title: 'Alinhar na linha com dois sensores', dialect: 'spike', tags: ['esquadro', 'C e D'],
    desc: 'Cada roda avança até o seu sensor ver preto: o robô fica perpendicular à linha, corrigindo erros acumulados.',
    code: HEAD + `
PRETO = 25

async def alinhar(vel=180):
    esq_ok = False
    dir_ok = False
    while not (esq_ok and dir_ok):
        esq_ok = esq_ok or color_sensor.reflection(port.C) < PRETO
        dir_ok = dir_ok or color_sensor.reflection(port.D) < PRETO
        motor.run(port.A, 0 if esq_ok else -vel)   # esquerdo: negativo anda para a frente
        motor.run(port.B, 0 if dir_ok else vel)
        await runloop.sleep_ms(5)
    motor.stop(port.A, stop=motor.HOLD)
    motor.stop(port.B, stop=motor.HOLD)

async def main():
    await alinhar()
    await sound.beep(880, 200)

runloop.run(main())
`,
  },
  {
    group: 'Estratégia FLL', title: 'Registrar dados no gráfico', dialect: 'spike', tags: ['app.linegraph', 'DADOS'],
    desc: 'Plota a reflexão do sensor C enquanto o robô anda. Abra a aba DADOS para ver o gráfico.',
    code: HEAD + `
from app import linegraph

PAR = motor_pair.PAIR_1

async def main():
    motor_pair.pair(PAR, port.A, port.B)
    linegraph.clear_all()
    linegraph.show(False)
    motor_pair.move(PAR, 0, velocity=250)
    for i in range(300):
        linegraph.plot(color.RED, i * 20, color_sensor.reflection(port.C))
        linegraph.plot(color.BLUE, i * 20, color_sensor.reflection(port.D))
        await runloop.sleep_ms(20)
    motor_pair.stop(PAR)
    media = await linegraph.get_average(color.RED)
    print('reflexão média do sensor C:', media)

runloop.run(main())
`,
  },
  {
    group: 'Pybricks', title: 'DriveBase: reto e giro', dialect: 'pybricks', tags: ['DriveBase', 'mm'],
    desc: 'No Pybricks você informa roda e bitola e manda andar em milímetros e girar em graus (positivo vira à direita).',
    code: `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction, Icon
from pybricks.robotics import DriveBase
from pybricks.tools import wait

hub = PrimeHub()
esq = Motor(Port.A, Direction.COUNTERCLOCKWISE)
dir = Motor(Port.B)
robo = DriveBase(esq, dir, wheel_diameter=56, axle_track=136)

hub.display.icon(Icon.HAPPY)
for i in range(4):
    robo.straight(400)
    robo.turn(-90)      # negativo: esquerda (anti-horário)
print('distância:', robo.distance(), 'mm  ângulo:', robo.angle(), 'graus')
wait(500)
`,
  },
  {
    group: 'Pybricks', title: 'DriveBase com giroscópio', dialect: 'pybricks', tags: ['use_gyro', 'settings'],
    desc: 'use_gyro(True) faz o DriveBase usar o giroscópio do hub para manter a direção e acertar os giros.',
    code: `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction
from pybricks.robotics import DriveBase

hub = PrimeHub()
robo = DriveBase(Motor(Port.A, Direction.COUNTERCLOCKWISE), Motor(Port.B), 56, 136)
robo.use_gyro(True)
robo.settings(straight_speed=400, turn_rate=180)

robo.straight(1500)
robo.turn(-90)          # esquerda
robo.straight(300)
print('rumo pelo giroscópio:', hub.imu.heading())
`,
  },
  {
    group: 'Pybricks', title: 'Seguidor de linha (Pybricks)', dialect: 'pybricks', tags: ['drive', 'ColorSensor'],
    desc: 'drive(velocidade, taxa_de_giro) com a taxa proporcional ao erro de reflexão. Use o tapete "Treino de linha".',
    code: `from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port, Direction
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch

sensor = ColorSensor(Port.C)
robo = DriveBase(Motor(Port.A, Direction.COUNTERCLOCKWISE), Motor(Port.B), 56, 136)

ALVO = 55
KP = 1.4
relogio = StopWatch()
while relogio.time() < 15000:
    erro = sensor.reflection() - ALVO
    robo.drive(120, KP * erro)
    wait(10)
robo.stop()
`,
  },
  {
    group: 'Pybricks', title: 'Menu FLL com hub_menu', dialect: 'pybricks', tags: ['hub_menu', 'Button'],
    desc: 'hub_menu mostra números na matriz: esquerda e direita escolhem, o botão central confirma.',
    code: `from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction, Button
from pybricks.robotics import DriveBase
from pybricks.tools import hub_menu

hub = PrimeHub()
hub.system.set_stop_button(Button.BLUETOOTH)   # o botão central fica livre para o menu
robo = DriveBase(Motor(Port.A, Direction.COUNTERCLOCKWISE), Motor(Port.B), 56, 136)

def saida1():
    robo.straight(600)
    robo.straight(-600)

def saida2():
    robo.turn(45)
    robo.straight(500)
    robo.turn(-45)

while True:
    escolha = hub_menu('1', '2')
    if escolha == '1':
        saida1()
    elif escolha == '2':
        saida2()
`,
  },
  {
    group: 'Pybricks', title: 'Tarefas em paralelo (async)', dialect: 'pybricks', tags: ['multitask', 'run_task'],
    desc: 'Com async/await e multitask o robô anda e mexe o braço ao mesmo tempo.',
    code: `from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction
from pybricks.robotics import DriveBase
from pybricks.tools import multitask, run_task

braco = Motor(Port.E)
robo = DriveBase(Motor(Port.A, Direction.COUNTERCLOCKWISE), Motor(Port.B), 56, 136)

async def main():
    await multitask(robo.straight(500), braco.run_angle(300, 90))
    await robo.turn(-90)
    await multitask(robo.straight(-300), braco.run_angle(300, -90))

run_task(main())
`,
  },
];
