# ============================================================================
#  MyFLL.lab :: spike.py
#  Módulos com a mesma API do Python do app SPIKE (versão 3) do hub Prime:
#  hub, motor, motor_pair, color_sensor, distance_sensor, force_sensor, color,
#  device, runloop, orientation, app, color_matrix, e o time do MicroPython.
# ============================================================================
import types, json
import _hw
import rt
from rt import Cmd, _W, K_TIME, K_STEP, S, register, cost

_mods = {}


def _mod(name, doc=''):
    m = types.ModuleType(name, doc)
    register(name, m)
    _mods[name] = m
    return m


def _i(v, what='valor'):
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        raise TypeError("can't convert float to int (use int(...) em " + what + ")")
    raise TypeError("can't convert " + type(v).__name__ + " to int (" + what + ")")


def _port(p):
    p = _i(p, 'porta')
    if p < 0 or p > 5:
        raise ValueError('porta inválida: use port.A até port.F')
    return p


def _need(p, kinds):
    p = _port(p)
    cost(40)
    k = _hw.dev_kind(p)
    if k not in kinds:
        raise OSError(19, 'ENODEV')
    return p


# ------------------------------------------------------------------ color
color = _mod('color', 'Constantes de cor')
for _n, _v in (('BLACK', 0), ('MAGENTA', 1), ('PURPLE', 2), ('BLUE', 3), ('AZURE', 4), ('TURQUOISE', 5), ('GREEN', 6),
               ('YELLOW', 7), ('ORANGE', 8), ('RED', 9), ('WHITE', 10), ('UNKNOWN', -1)):
    setattr(color, _n, _v)

orientation = _mod('orientation')
orientation.UP = 0; orientation.RIGHT = 1; orientation.DOWN = 2; orientation.LEFT = 3

# ------------------------------------------------------------------ hub.port
port = _mod('hub.port')
for _k, _L in enumerate('ABCDEF'):
    setattr(port, _L, _k)

# ------------------------------------------------------------------ hub.button
button = _mod('hub.button')
button.LEFT = 1; button.RIGHT = 2


def _btn_pressed(b):
    b = _i(b, 'botão')
    cost(20)
    if b == 1:
        return int(_hw.btn('left'))
    if b == 2:
        return int(_hw.btn('right'))
    raise ValueError('botão inválido: use button.LEFT ou button.RIGHT')


button.pressed = _btn_pressed

# ------------------------------------------------------------------ hub.light
light = _mod('hub.light')
light.POWER = 0; light.CONNECT = 1


def _light_color(which, c):
    which = _i(which, 'luz'); c = _i(c, 'cor')
    if which not in (0, 1):
        raise ValueError('luz inválida: use light.POWER ou light.CONNECT')
    _hw.light(which, c)


light.color = _light_color

# ------------------------------------------------------------------ hub.light_matrix
light_matrix = _mod('hub.light_matrix')
_IMGS = ['HEART', 'HEART_SMALL', 'HAPPY', 'SMILE', 'SAD', 'CONFUSED', 'ANGRY', 'ASLEEP', 'SURPRISED', 'SILLY',
         'FABULOUS', 'MEH', 'YES', 'NO', 'CLOCK12', 'CLOCK1', 'CLOCK2', 'CLOCK3', 'CLOCK4', 'CLOCK5', 'CLOCK6', 'CLOCK7', 'CLOCK8',
         'CLOCK9', 'CLOCK10', 'CLOCK11', 'ARROW_N', 'ARROW_NE', 'ARROW_E', 'ARROW_SE', 'ARROW_S', 'ARROW_SW', 'ARROW_W', 'ARROW_NW',
         'GO_RIGHT', 'GO_LEFT', 'GO_UP', 'GO_DOWN', 'TRIANGLE', 'TRIANGLE_LEFT', 'CHESSBOARD', 'DIAMOND', 'DIAMOND_SMALL', 'SQUARE',
         'SQUARE_SMALL', 'RABBIT', 'COW', 'MUSIC_CROTCHET', 'MUSIC_QUAVER', 'MUSIC_QUAVERS', 'PITCHFORK', 'XMAS', 'PACMAN', 'TARGET',
         'TSHIRT', 'ROLLERSKATE', 'DUCK', 'HOUSE', 'TORTOISE', 'BUTTERFLY', 'STICKFIGURE', 'GHOST', 'SWORD', 'GIRAFFE', 'SKULL',
         'UMBRELLA', 'SNAKE']
for _k, _n in enumerate(_IMGS):
    setattr(light_matrix, 'IMAGE_' + _n, _k + 1)


def _xy(x, y):
    x = _i(x, 'x'); y = _i(y, 'y')
    if not (0 <= x <= 4 and 0 <= y <= 4):
        raise ValueError('x e y vão de 0 a 4')
    return x, y


def _lm_show(pixels):
    px = list(pixels)
    if len(px) != 25:
        raise ValueError('show() precisa de uma lista com 25 valores')
    _hw.lm_show(json.dumps([_i(v, 'brilho') for v in px]))


def _lm_set_pixel(x, y, intensity):
    x, y = _xy(x, y)
    _hw.lm_set(x, y, _i(intensity, 'brilho'))


def _lm_get_pixel(x, y):
    x, y = _xy(x, y)
    return int(_hw.lm_get(x, y))


def _lm_show_image(image):
    image = _i(image, 'imagem')
    if not (1 <= image <= 67):
        raise ValueError('imagem vai de 1 a 67')
    _hw.lm_image(image)


def _lm_write(text, intensity=100, time_per_character=500):
    return Cmd(int(_hw.lm_write(str(text), _i(intensity, 'brilho'), _i(time_per_character, 'tempo'))))


def _lm_set_orientation(top):
    top = _i(top, 'orientação')
    if top not in (0, 1, 2, 3):
        raise ValueError('use orientation.UP, RIGHT, DOWN ou LEFT')
    _hw.lm_orient(top)
    return top


light_matrix.show = _lm_show
light_matrix.set_pixel = _lm_set_pixel
light_matrix.get_pixel = _lm_get_pixel
light_matrix.clear = lambda: _hw.lm_clear()
light_matrix.show_image = _lm_show_image
light_matrix.write = _lm_write
light_matrix.set_orientation = _lm_set_orientation
light_matrix.get_orientation = lambda: int(_hw.lm_get_orient())

# ------------------------------------------------------------------ hub.motion_sensor
motion_sensor = _mod('hub.motion_sensor')
for _n, _v in (('TAPPED', 0), ('DOUBLE_TAPPED', 1), ('SHAKEN', 2), ('FALLING', 3), ('UNKNOWN', -1),
               ('TOP', 0), ('FRONT', 1), ('RIGHT', 2), ('BOTTOM', 3), ('BACK', 4), ('LEFT', 5)):
    setattr(motion_sensor, _n, _v)


def _t3(s):
    a = json.loads(s)
    return (int(a[0]), int(a[1]), int(a[2]))


def _ms_tilt():
    cost(30)
    return _t3(_hw.imu_tilt())


def _ms_acc(raw_unfiltered=False):
    cost(30)
    return _t3(_hw.imu_acc())


def _ms_gyro(raw_unfiltered=False):
    cost(30)
    return _t3(_hw.imu_gyro())


def _ms_reset_yaw(angle=0):
    _hw.imu_reset_yaw(_i(angle, 'ângulo'))


def _ms_set_yaw_face(up):
    up = _i(up, 'face')
    if not (0 <= up <= 5):
        raise ValueError('face inválida')
    _hw.imu_set_face(up)
    return True


def _ms_quat():
    a = json.loads(_hw.imu_quat())
    return (float(a[0]), float(a[1]), float(a[2]), float(a[3]))


motion_sensor.tilt_angles = _ms_tilt
motion_sensor.acceleration = _ms_acc
motion_sensor.angular_velocity = _ms_gyro
motion_sensor.reset_yaw = _ms_reset_yaw
motion_sensor.set_yaw_face = _ms_set_yaw_face
motion_sensor.get_yaw_face = lambda: int(_hw.imu_get_face())
motion_sensor.up_face = lambda: int(_hw.imu_up())
motion_sensor.gesture = lambda: int(_hw.imu_gesture())
motion_sensor.tap_count = lambda: int(_hw.imu_taps())
motion_sensor.reset_tap_count = lambda: _hw.imu_reset_taps()
motion_sensor.stable = lambda: bool(_hw.imu_stable())
motion_sensor.quaternion = _ms_quat

# ------------------------------------------------------------------ hub.sound
sound = _mod('hub.sound')
sound.ANY = -2; sound.DEFAULT = -1
sound.WAVEFORM_SINE = 1; sound.WAVEFORM_SQUARE = 2; sound.WAVEFORM_SAWTOOTH = 3; sound.WAVEFORM_TRIANGLE = 4


def _beep(freq=440, duration=500, volume=100, *, attack=0, decay=0, sustain=100, release=0, transition=10, waveform=1, channel=-1):
    return Cmd(int(_hw.beep(_i(freq, 'frequência'), _i(duration, 'duração'), _i(volume, 'volume'), _i(waveform, 'forma de onda'))))


sound.beep = _beep
sound.stop = lambda: _hw.sound_stop()
sound.volume = lambda volume: _hw.volume(_i(volume, 'volume'))

# ------------------------------------------------------------------ hub
hub = _mod('hub', 'Hub SPIKE Prime')
hub.port = port; hub.button = button; hub.light = light; hub.light_matrix = light_matrix
hub.motion_sensor = motion_sensor; hub.sound = sound
hub.device_uuid = lambda: '4d794646-4c2e-6c61-6200-00000000f11e'
hub.hardware_id = lambda: 'MYFLL-PRIME-01'
hub.temperature = lambda: int(_hw.hub_temp())


def _power_off():
    _hw.power_off()
    raise SystemExit


hub.power_off = _power_off

# ------------------------------------------------------------------ motor
motor = _mod('motor')
for _n, _v in (('READY', 0), ('RUNNING', 1), ('STALLED', 2), ('CANCELLED', 3), ('ERROR', 4), ('DISCONNECTED', 5),
               ('COAST', 0), ('BRAKE', 1), ('HOLD', 2), ('CONTINUE', 3), ('SMART_COAST', 4), ('SMART_BRAKE', 5),
               ('CLOCKWISE', 0), ('COUNTERCLOCKWISE', 1), ('SHORTEST_PATH', 2), ('LONGEST_PATH', 3)):
    setattr(motor, _n, _v)

_M = ('motor',)


def _stopv(s):
    s = _i(s, 'stop')
    if not (0 <= s <= 5):
        raise ValueError('stop inválido')
    return s


def m_absolute_position(port):
    p = _need(port, _M)
    return int(_hw.m_abs(p))


def m_relative_position(port):
    p = _need(port, _M)
    return int(_hw.m_rel(p))


def m_reset_relative_position(port, position):
    p = _need(port, _M)
    _hw.m_reset_rel(p, _i(position, 'posição'))


def m_velocity(port):
    p = _need(port, _M)
    return int(_hw.m_vel(p))


def m_get_duty_cycle(port):
    p = _need(port, _M)
    return int(_hw.m_get_duty(p))


def m_run(port, velocity, *, acceleration=1000):
    p = _need(port, _M)
    _hw.m_run(p, _i(velocity, 'velocidade'), _i(acceleration, 'aceleração'))


def m_run_for_degrees(port, degrees, velocity, *, stop=1, acceleration=1000, deceleration=1000):
    p = _need(port, _M)
    return Cmd(int(_hw.m_deg(p, _i(degrees, 'graus'), _i(velocity, 'velocidade'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def m_run_for_time(port, duration, velocity, *, stop=1, acceleration=1000, deceleration=1000):
    p = _need(port, _M)
    return Cmd(int(_hw.m_time(p, _i(duration, 'duração'), _i(velocity, 'velocidade'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def m_run_to_absolute_position(port, position, velocity, *, direction=2, stop=1, acceleration=1000, deceleration=1000):
    p = _need(port, _M)
    return Cmd(int(_hw.m_abs_to(p, _i(position, 'posição'), _i(velocity, 'velocidade'), _i(direction, 'direção'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def m_run_to_relative_position(port, position, velocity, *, stop=1, acceleration=1000, deceleration=1000):
    p = _need(port, _M)
    return Cmd(int(_hw.m_rel_to(p, _i(position, 'posição'), _i(velocity, 'velocidade'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def m_set_duty_cycle(port, pwm):
    p = _need(port, _M)
    _hw.m_duty(p, max(-10000, min(10000, _i(pwm, 'pwm'))))


def m_stop(port, *, stop=1):
    p = _need(port, _M)
    _hw.m_stop(p, _stopv(stop))


for _n in ('absolute_position', 'relative_position', 'reset_relative_position', 'velocity', 'get_duty_cycle', 'run',
           'run_for_degrees', 'run_for_time', 'run_to_absolute_position', 'run_to_relative_position', 'set_duty_cycle', 'stop'):
    _f = globals()['m_' + _n]
    _f.__name__ = _n
    setattr(motor, _n, _f)

# ------------------------------------------------------------------ motor_pair
motor_pair = _mod('motor_pair')
motor_pair.PAIR_1 = 0; motor_pair.PAIR_2 = 1; motor_pair.PAIR_3 = 2


def _pair(p):
    p = _i(p, 'par')
    if p not in (0, 1, 2):
        raise ValueError('par inválido: use motor_pair.PAIR_1, PAIR_2 ou PAIR_3')
    if not _hw.p_ok(p):
        raise RuntimeError('esse par não foi configurado: chame motor_pair.pair(par, porta_esq, porta_dir) antes')
    cost(40)
    return p


def _steer(s):
    s = _i(s, 'direção (steering)')
    return max(-100, min(100, s))


def mp_pair(pair, left_motor, right_motor):
    pair = _i(pair, 'par')
    if pair not in (0, 1, 2):
        raise ValueError('par inválido')
    l = _need(left_motor, _M); r = _need(right_motor, _M)
    if l == r:
        raise ValueError('os dois motores do par precisam ser diferentes')
    _hw.p_pair(pair, l, r)


def mp_unpair(pair):
    _hw.p_unpair(_i(pair, 'par'))


def mp_move(pair, steering, *, velocity=360, acceleration=1000):
    p = _pair(pair)
    _hw.p_move(p, _steer(steering), _i(velocity, 'velocidade'), _i(acceleration, 'aceleração'))


def mp_move_for_degrees(pair, degrees, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
    p = _pair(pair)
    return Cmd(int(_hw.p_move_deg(p, _i(degrees, 'graus'), _steer(steering), _i(velocity, 'velocidade'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def mp_move_for_time(pair, duration, steering, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
    p = _pair(pair)
    return Cmd(int(_hw.p_move_time(p, _i(duration, 'duração'), _steer(steering), _i(velocity, 'velocidade'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def mp_move_tank(pair, left_velocity, right_velocity, *, acceleration=1000):
    p = _pair(pair)
    _hw.p_tank(p, _i(left_velocity, 'velocidade esquerda'), _i(right_velocity, 'velocidade direita'), _i(acceleration, 'aceleração'))


def mp_move_tank_for_degrees(pair, degrees, left_velocity, right_velocity, *, stop=1, acceleration=1000, deceleration=1000):
    p = _pair(pair)
    return Cmd(int(_hw.p_tank_deg(p, _i(degrees, 'graus'), _i(left_velocity, 'velocidade esquerda'), _i(right_velocity, 'velocidade direita'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def mp_move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=1, acceleration=1000, deceleration=1000):
    p = _pair(pair)
    return Cmd(int(_hw.p_tank_time(p, _i(duration, 'duração'), _i(left_velocity, 'velocidade esquerda'), _i(right_velocity, 'velocidade direita'), _stopv(stop), _i(acceleration, 'aceleração'), _i(deceleration, 'desaceleração'))))


def mp_stop(pair, *, stop=1):
    p = _pair(pair)
    _hw.p_stop(p, _stopv(stop))


for _n in ('pair', 'unpair', 'move', 'move_for_degrees', 'move_for_time', 'move_tank', 'move_tank_for_degrees', 'move_tank_for_time', 'stop'):
    _f = globals()['mp_' + _n]
    _f.__name__ = _n
    setattr(motor_pair, _n, _f)

# ------------------------------------------------------------------ sensores
color_sensor = _mod('color_sensor')


def cs_color(port):
    p = _need(port, ('color',))
    return int(_hw.c_color(p))


def cs_reflection(port):
    p = _need(port, ('color',))
    return int(_hw.c_refl(p))


def cs_rgbi(port):
    p = _need(port, ('color',))
    a = json.loads(_hw.c_rgbi(p))
    return (int(a[0]), int(a[1]), int(a[2]), int(a[3]))


cs_color.__name__ = 'color'; cs_reflection.__name__ = 'reflection'; cs_rgbi.__name__ = 'rgbi'
color_sensor.color = cs_color; color_sensor.reflection = cs_reflection; color_sensor.rgbi = cs_rgbi

distance_sensor = _mod('distance_sensor')


def ds_distance(port):
    p = _need(port, ('distance',))
    return int(_hw.d_dist(p))


def _ds_xy(x, y):
    x = _i(x, 'x'); y = _i(y, 'y')
    if not (0 <= x <= 1 and 0 <= y <= 1):
        raise ValueError('x e y vão de 0 a 1 (quatro luzes)')
    return y * 2 + x


def ds_clear(port):
    p = _need(port, ('distance',))
    _hw.d_lights(p, 0, 0, 0, 0)


def ds_set_pixel(port, x, y, intensity):
    p = _need(port, ('distance',))
    _hw.d_light(p, _ds_xy(x, y), max(0, min(100, _i(intensity, 'brilho'))))


def ds_get_pixel(port, x, y):
    p = _need(port, ('distance',))
    return int(_hw.d_get_light(p, _ds_xy(x, y)))


def ds_show(port, pixels):
    p = _need(port, ('distance',))
    px = [_i(v, 'brilho') for v in pixels]
    if len(px) != 4:
        raise ValueError('show() precisa de 4 valores')
    _hw.d_lights(p, px[0], px[1], px[2], px[3])


distance_sensor.distance = ds_distance; distance_sensor.clear = ds_clear; distance_sensor.set_pixel = ds_set_pixel
distance_sensor.get_pixel = ds_get_pixel; distance_sensor.show = ds_show

force_sensor = _mod('force_sensor')


def fs_force(port):
    p = _need(port, ('force',))
    return int(round(_hw.f_force(p) * 10))


def fs_pressed(port):
    p = _need(port, ('force',))
    return bool(_hw.f_force(p) >= 0.5)


def fs_raw(port):
    p = _need(port, ('force',))
    return int(384 + _hw.f_force(p) * 62)


force_sensor.force = fs_force; force_sensor.pressed = fs_pressed; force_sensor.raw = fs_raw

# ------------------------------------------------------------------ device
device = _mod('device')


def dv_id(port):
    p = _port(port)
    i = int(_hw.dev_id(p))
    if i < 0:
        raise OSError(19, 'ENODEV')
    return i


def dv_ready(port):
    p = _port(port)
    return int(_hw.dev_id(p)) >= 0


def dv_data(port):
    p = _port(port)
    s = _hw.dev_data(p)
    if not s:
        raise OSError(19, 'ENODEV')
    return tuple(int(v) for v in json.loads(s))


def dv_get_duty(port):
    p = _need(port, _M)
    return abs(int(_hw.m_get_duty(p)))


def dv_set_duty(port, duty_cycle):
    p = _need(port, _M)
    _hw.m_duty(p, max(-10000, min(10000, _i(duty_cycle, 'duty'))))


device.id = dv_id; device.ready = dv_ready; device.data = dv_data
device.get_duty_cycle = dv_get_duty; device.set_duty_cycle = dv_set_duty

# ------------------------------------------------------------------ color_matrix (sem o dispositivo)
color_matrix = _mod('color_matrix')


def _no_cm(*a, **k):
    raise OSError(19, 'ENODEV')


for _n in ('clear', 'get_pixel', 'set_pixel', 'show'):
    setattr(color_matrix, _n, _no_cm)

# ------------------------------------------------------------------ runloop
runloop = _mod('runloop')


def rl_sleep_ms(duration):
    return rt.sleep_ms_await(_i(duration, 'duração'))


async def rl_until(function, timeout=0):
    timeout = _i(timeout, 'timeout')
    t_end = S.now + timeout if timeout > 0 else None
    while True:
        r = function()
        if isinstance(r, rt._SyncCoro):
            r = rt._run_sync(r.coro)
        if r:
            return None
        if t_end is not None and S.now >= t_end:
            return None
        await _W(K_STEP, 0, S.stepn)


def rl_run(*functions):
    return rt.rl_run_sync(*functions)


rl_sleep_ms.__name__ = 'sleep_ms'; rl_until.__name__ = 'until'; rl_run.__name__ = 'run'
runloop.sleep_ms = rl_sleep_ms; runloop.until = rl_until; runloop.run = rl_run

# ------------------------------------------------------------------ app (no computador)
app = _mod('app')
_app_sub = {}


def _appcall(kind, **kw):
    kw['k'] = kind
    _hw.app(json.dumps(kw))


def _sub(name):
    m = _mod('app.' + name)
    setattr(app, name, m)
    return m


_lg = _sub('linegraph')
_lg_data = {}


def _lg_plot(color, x, y):
    c = _i(color, 'cor')
    _lg_data.setdefault(c, []).append((float(x), float(y)))
    _appcall('lg_plot', c=c, x=float(x), y=float(y))


def _lg_stat(color, fn):
    ys = [p[1] for p in _lg_data.get(_i(color, 'cor'), [])]
    return Cmd(0, value=(fn(ys) if ys else 0.0))


_lg.plot = _lg_plot
_lg.clear = lambda color: (_lg_data.pop(_i(color, 'cor'), None), _appcall('lg_clear', c=color))[1]
_lg.clear_all = lambda: (_lg_data.clear(), _appcall('lg_clear_all'))[1]
_lg.show = lambda fullscreen=False: _appcall('lg_show', f=bool(fullscreen))
_lg.hide = lambda: _appcall('lg_hide')
_lg.get_average = lambda color: _lg_stat(color, lambda v: sum(v) / len(v))
_lg.get_last = lambda color: _lg_stat(color, lambda v: v[-1])
_lg.get_max = lambda color: _lg_stat(color, max)
_lg.get_min = lambda color: _lg_stat(color, min)

_bg = _sub('bargraph')
_bg_data = {}


def _bg_set(color, value):
    c = _i(color, 'cor')
    _bg_data[c] = float(value)
    _appcall('bg_set', c=c, v=float(value))


def _bg_change(color, value):
    c = _i(color, 'cor')
    _bg_data[c] = _bg_data.get(c, 0.0) + float(value)
    _appcall('bg_set', c=c, v=_bg_data[c])


_bg.set_value = _bg_set
_bg.change = _bg_change
_bg.get_value = lambda color: Cmd(0, value=_bg_data.get(_i(color, 'cor'), 0.0))
_bg.clear_all = lambda: (_bg_data.clear(), _appcall('bg_clear_all'))[1]
_bg.show = lambda fullscreen=False: _appcall('bg_show', f=bool(fullscreen))
_bg.hide = lambda: _appcall('bg_hide')

_dp = _sub('display')
for _k, _n in enumerate(['ROBOT_1', 'ROBOT_2', 'ROBOT_3', 'ROBOT_4', 'ROBOT_5', 'HUB_1', 'HUB_2', 'HUB_3', 'HUB_4',
                         'AMUSEMENT_PARK', 'BEACH', 'HAUNTED_HOUSE', 'CARNIVAL', 'BOOKSHELF', 'PLAYGROUND', 'MOON', 'CAVE',
                         'OCEAN', 'POLAR_BEAR', 'PARK', 'RANDOM']):
    setattr(_dp, 'IMAGE_' + _n, _k + 1)
_dp.text = lambda text: _appcall('dp_text', t=str(text))
_dp.image = lambda image: _appcall('dp_image', i=_i(image, 'imagem'))
_dp.show = lambda fullscreen=False: _appcall('dp_show', f=bool(fullscreen))
_dp.hide = lambda: _appcall('dp_hide')

_ms = _sub('music')
for _n, _v in (('DRUM_SNARE', 1), ('DRUM_BASS', 2), ('DRUM_SIDE_STICK', 3), ('DRUM_CRASH_CYMBAL', 4), ('DRUM_OPEN_HI_HAT', 5),
               ('DRUM_CLOSED_HI_HAT', 6), ('DRUM_TAMBOURINE', 7), ('DRUM_HAND_CLAP', 8), ('DRUM_CLAVES', 9), ('DRUM_WOOD_BLOCK', 10),
               ('DRUM_COWBELL', 11), ('DRUM_TRIANGLE', 12), ('DRUM_BONGO', 13), ('DRUM_CONGA', 14), ('DRUM_CABASA', 15),
               ('DRUM_GUIRO', 16), ('DRUM_VIBRASLAP', 17), ('DRUM_CUICA', 18),
               ('INSTRUMENT_PIANO', 1), ('INSTRUMENT_ELECTRIC_PIANO', 2), ('INSTRUMENT_ORGAN', 3), ('INSTRUMENT_GUITAR', 4),
               ('INSTRUMENT_ELECTRIC_GUITAR', 5), ('INSTRUMENT_BASS', 6), ('INSTRUMENT_PIZZICATO', 7), ('INSTRUMENT_CELLO', 8),
               ('INSTRUMENT_TROMBONE', 9), ('INSTRUMENT_CLARINET', 10), ('INSTRUMENT_SAXOPHONE', 11), ('INSTRUMENT_FLUTE', 12),
               ('INSTRUMENT_WOODEN_FLUTE', 13), ('INSTRUMENT_BASSOON', 14), ('INSTRUMENT_CHOIR', 15), ('INSTRUMENT_VIBRAPHONE', 16),
               ('INSTRUMENT_MUSIC_BOX', 17), ('INSTRUMENT_STEEL_DRUM', 18), ('INSTRUMENT_MARIMBA', 19), ('INSTRUMENT_SYNTH_LEAD', 20),
               ('INSTRUMENT_SYNTH_PAD', 21)):
    setattr(_ms, _n, _v)
_ms.play_drum = lambda drum: _appcall('drum', d=_i(drum, 'tambor'))
_ms.play_instrument = lambda instrument, note, duration: _appcall('inst', i=_i(instrument, 'instrumento'), n=_i(note, 'nota'), d=_i(duration, 'duração'))

_sd = _sub('sound')


def _app_play(sound_name, volume=100, pitch=0, pan=0):
    _appcall('snd', n=str(sound_name), v=_i(volume, 'volume'), p=_i(pitch, 'tom'))
    return rt.sleep_ms_await(700)


_sd.play = _app_play
_sd.set_attributes = lambda volume, pitch, pan: _appcall('snd_attr', v=volume, p=pitch)
_sd.stop = lambda: _appcall('snd_stop')

# ------------------------------------------------------------------ time (MicroPython)
import time as _ptime
utime = _mod('time')
register('utime', utime)


def _t_sleep(s):
    return rt.block_or_await(_W(K_TIME, S.now + float(s) * 1000.0))


def _t_sleep_ms(ms):
    return rt.block_or_await(_W(K_TIME, S.now + float(ms)))


def _t_sleep_us(us):
    return rt.block_or_await(_W(K_TIME, S.now + float(us) / 1000.0))


def _ticks_ms():
    cost(20)
    return int(_hw.now()) & 0x3FFFFFFF


def _ticks_us():
    cost(20)
    return int(_hw.now() * 1000) & 0x3FFFFFFF


def _ticks_diff(a, b):
    d = (a - b) & 0x3FFFFFFF
    if d >= 0x20000000:
        d -= 0x40000000
    return d


_t_sleep.__name__ = 'sleep'; _t_sleep_ms.__name__ = 'sleep_ms'; _t_sleep_us.__name__ = 'sleep_us'
utime.sleep = _t_sleep; utime.sleep_ms = _t_sleep_ms; utime.sleep_us = _t_sleep_us
utime.ticks_ms = _ticks_ms; utime.ticks_us = _ticks_us; utime.ticks_cpu = _ticks_us
utime.ticks_diff = _ticks_diff
utime.ticks_add = lambda t, d: (t + d) & 0x3FFFFFFF
utime.time = lambda: 1735689600 + int(_hw.now() / 1000)
utime.time_ns = lambda: int(_hw.now() * 1e6)
utime.monotonic = lambda: _hw.now() / 1000.0
utime.localtime = _ptime.localtime
utime.gmtime = _ptime.gmtime

# ------------------------------------------------------------------ asyncio (subconjunto do MicroPython)
aio = _mod('asyncio')
register('uasyncio', aio)


def _aio_sleep(s):
    return rt.sleep_ms_await(float(s) * 1000.0)


async def _aio_gather(*coros, return_exceptions=False):
    ts = [rt.spawn(c) for c in coros]
    await _W(rt.K_JOIN, ts)
    return [t.result for t in ts]


def _aio_create_task(coro):
    return rt.spawn(coro)


def _aio_run(coro):
    return rt.rl_run_sync(coro)


aio.sleep = _aio_sleep; aio.sleep_ms = rl_sleep_ms; aio.gather = _aio_gather
aio.create_task = _aio_create_task; aio.run = _aio_run

micropython = _mod('micropython')
micropython.const = lambda x: x
micropython.opt_level = lambda *a: 0
micropython.mem_info = lambda *a: print('stack: 1024 out of 16384\nGC: total: 262144, used: 18432, free: 243712')
micropython.native = lambda f: f
micropython.viper = lambda f: f
register('urandom', __import__('random'))
register('umath', __import__('math'))
register('ujson', __import__('json'))


# ------------------------------------------------------------------ reinício
@rt.on_reset
def _reset():
    _lg_data.clear(); _bg_data.clear()
