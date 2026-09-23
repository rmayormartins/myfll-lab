# ============================================================================
#  MyFLL.lab :: pybricks.py
#  Subconjunto fiel do Pybricks para o Prime Hub: hubs, pupdevices, parameters,
#  robotics (DriveBase), tools (wait, StopWatch, multitask, run_task, hub_menu),
#  geometry (Matrix, vector). Programas comuns bloqueiam em cada comando; com
#  async/await os mesmos comandos viram aguardáveis.
# ============================================================================
import types, json, math
import _hw
import rt
from rt import Cmd, _W, K_TIME, K_STEP, K_JOIN, S, register, cost, take_direct


def _mod(name):
    m = types.ModuleType(name)
    register(name, m)
    return m


def _num(v, what='valor'):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v
    raise TypeError(what + ' precisa ser um número')


# ------------------------------------------------------------------ parameters
class _Const:
    __slots__ = ('_n', '_v', '_g')

    def __init__(self, group, name, value):
        self._g = group; self._n = name; self._v = value

    def __repr__(self):
        return self._g + '.' + self._n

    def __eq__(self, o):
        return isinstance(o, _Const) and o._g == self._g and o._v == self._v

    def __hash__(self):
        return hash((self._g, self._v))


class _Group:
    def __init__(self, name, items):
        self._name = name
        for k, v in items:
            setattr(self, k, _Const(name, k, v))

    def __repr__(self):
        return self._name


Port = _Group('Port', [(L, i) for i, L in enumerate('ABCDEF')])
Direction = _Group('Direction', [('CLOCKWISE', 1), ('COUNTERCLOCKWISE', -1)])
Stop = _Group('Stop', [('COAST', 0), ('BRAKE', 1), ('HOLD', 2), ('NONE', 3), ('COAST_SMART', 4)])
Button = _Group('Button', [('LEFT', 'left'), ('RIGHT', 'right'), ('CENTER', 'center'), ('BLUETOOTH', 'bt'),
                           ('LEFT_PLUS', 'lp'), ('LEFT_MINUS', 'lm'), ('RIGHT_PLUS', 'rp'), ('RIGHT_MINUS', 'rm'), ('UP', 'up'), ('DOWN', 'down')])
Side = _Group('Side', [('TOP', 0), ('FRONT', 1), ('RIGHT', 2), ('BOTTOM', 3), ('BACK', 4), ('LEFT', 5)])


class Color:
    def __init__(self, h, s=100, v=100):
        self.h = int(h) % 360; self.s = max(0, min(100, int(s))); self.v = max(0, min(100, int(v)))
        self._name = None

    def __eq__(self, o):
        return isinstance(o, Color) and (self.h, self.s, self.v) == (o.h, o.s, o.v)

    def __hash__(self):
        return hash((self.h, self.s, self.v))

    def __repr__(self):
        return 'Color.' + self._name if self._name else 'Color(h=%d, s=%d, v=%d)' % (self.h, self.s, self.v)

    def __mul__(self, k):
        return Color(self.h, self.s, self.v * k)

    __rmul__ = __mul__

    def __truediv__(self, k):
        return Color(self.h, self.s, self.v / k)

    def __iter__(self):
        return iter((self.h, self.s, self.v))


for _n, _hsv in (('RED', (0, 100, 100)), ('ORANGE', (30, 100, 100)), ('YELLOW', (60, 100, 100)), ('GREEN', (120, 100, 100)),
                 ('CYAN', (180, 100, 100)), ('BLUE', (240, 100, 100)), ('VIOLET', (270, 100, 100)), ('MAGENTA', (300, 100, 100)),
                 ('WHITE', (0, 0, 100)), ('GRAY', (0, 0, 50)), ('BLACK', (0, 0, 10)), ('NONE', (0, 0, 0)), ('BROWN', (30, 100, 40))):
    _c = Color(*_hsv); _c._name = _n; setattr(Color, _n, _c)


def _hsv_hex(c):
    h, s, v = c.h / 360.0, c.s / 100.0, c.v / 100.0
    i = int(h * 6) % 6; f = h * 6 - int(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return '#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))


class Matrix:
    def __init__(self, rows):
        self._r = [list(map(float, r)) if isinstance(r, (list, tuple)) else [float(r)] for r in rows]
        self.shape = (len(self._r), len(self._r[0]) if self._r else 0)

    def __getitem__(self, k):
        if isinstance(k, tuple):
            return self._r[k[0]][k[1]]
        if self.shape[1] == 1:
            return self._r[k][0]
        return self._r[k]

    def __len__(self):
        return self.shape[0] * self.shape[1]

    def __iter__(self):
        for r in self._r:
            for v in r:
                yield v

    def __add__(self, o):
        return Matrix([[a + b for a, b in zip(ra, rb)] for ra, rb in zip(self._r, o._r)])

    def __sub__(self, o):
        return Matrix([[a - b for a, b in zip(ra, rb)] for ra, rb in zip(self._r, o._r)])

    def __mul__(self, o):
        if isinstance(o, Matrix):
            cols = list(zip(*o._r))
            return Matrix([[sum(a * b for a, b in zip(r, c)) for c in cols] for r in self._r])
        return Matrix([[a * o for a in r] for r in self._r])

    __rmul__ = lambda self, o: self.__mul__(o)

    def __neg__(self):
        return self * -1

    def __abs__(self):
        return math.sqrt(sum(v * v for v in self))

    @property
    def T(self):
        return Matrix([list(c) for c in zip(*self._r)])

    def __repr__(self):
        return 'Matrix(' + repr(self._r) + ')'


def vector(x, y, z=None):
    return Matrix([[x], [y]] if z is None else [[x], [y], [z]])


def cross(a, b):
    return vector(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


Axis = types.SimpleNamespace(X=vector(1, 0, 0), Y=vector(0, 1, 0), Z=vector(0, 0, 1))


def _icon(s):
    return Matrix([[100 if ch == '1' else (50 if ch == '5' else 0) for ch in row] for row in s.split(':')])


Icon = types.SimpleNamespace()
for _n, _s in (('UP', '00100:01110:11111:00000:00000'), ('DOWN', '00000:00000:11111:01110:00100'),
               ('LEFT', '00100:01100:11100:01100:00100'), ('RIGHT', '00100:00110:00111:00110:00100'),
               ('ARROW_UP', '00100:01110:10101:00100:00100'), ('ARROW_DOWN', '00100:00100:10101:01110:00100'),
               ('ARROW_LEFT', '00100:01000:11111:01000:00100'), ('ARROW_RIGHT', '00100:00010:11111:00010:00100'),
               ('ARROW_LEFT_UP', '11100:11000:10100:00010:00001'), ('ARROW_RIGHT_UP', '00111:00011:00101:01000:10000'),
               ('ARROW_LEFT_DOWN', '00001:00010:10100:11000:11100'), ('ARROW_RIGHT_DOWN', '10000:01000:00101:00011:00111'),
               ('HEART', '01010:11111:11111:01110:00100'), ('HAPPY', '00000:01010:00000:10001:01110'),
               ('SAD', '00000:01010:00000:01110:10001'), ('SQUARE', '11111:10001:10001:10001:11111'),
               ('CIRCLE', '01110:10001:10001:10001:01110'), ('TRUE', '00000:00001:00010:10100:01000'),
               ('FALSE', '10001:01010:00100:01010:10001'), ('EMPTY', '00000:00000:00000:00000:00000'),
               ('FULL', '11111:11111:11111:11111:11111'), ('PAUSE', '00000:01010:01010:01010:00000'),
               ('CLOCKWISE', '01110:10001:10101:00101:11100'), ('COUNTERCLOCKWISE', '01110:10001:10101:10100:00111'),
               ('EYE_LEFT', '00000:11000:11000:00000:00000'), ('EYE_RIGHT', '00000:00011:00011:00000:00000'),
               ('EYE_LEFT_BLINK', '00000:00000:11000:00000:00000'), ('EYE_RIGHT_BLINK', '00000:00000:00011:00000:00000'),
               ('EYE_LEFT_BROW', '11000:00000:11000:11000:00000'), ('EYE_RIGHT_BROW', '00011:00000:00011:00011:00000'),
               ('TRIANGLE_UP', '00000:00100:01010:11111:00000'), ('TRIANGLE_DOWN', '00000:11111:01010:00100:00000'),
               ('TRIANGLE_LEFT', '00010:00110:01010:00110:00010'), ('TRIANGLE_RIGHT', '01000:01100:01010:01100:01000')):
    setattr(Icon, _n, _icon(_s))

_STOPCODE = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4}


def _stop(then):
    if not isinstance(then, _Const) or then._g != 'Stop':
        raise TypeError('then precisa ser Stop.COAST, Stop.BRAKE, Stop.HOLD ou Stop.NONE')
    return _STOPCODE[then._v]


def _portidx(port):
    if not isinstance(port, _Const) or port._g != 'Port':
        raise TypeError('use Port.A até Port.F')
    return port._v


def _need(port, kinds):
    p = _portidx(port)
    k = _hw.dev_kind(p)
    if k not in kinds:
        raise OSError(19, 'ENODEV: nenhum dispositivo compatível na porta ' + 'ABCDEF'[p])
    return p


# ------------------------------------------------------------------ bloqueio x async
def _blocking(coro):
    d = take_direct()
    if d == 1:
        return rt._SyncCoro(coro)
    if S.mode == 'pybricks_async' and d == 0:
        return coro
    return rt._run_sync(coro)


def _wait_cmd(cid, wait=True):
    return rt.cmd_result(cid, wait)


def wait(time):
    ms = _num(time, 'time')
    return rt.block_or_await(_W(K_TIME, S.now + max(0.0, float(ms))))


class StopWatch:
    def __init__(self):
        self._t0 = _hw.now(); self._paused = None

    def time(self):
        cost(20)
        return int((self._paused if self._paused is not None else _hw.now()) - self._t0)

    def pause(self):
        if self._paused is None:
            self._paused = _hw.now()

    def resume(self):
        if self._paused is not None:
            self._t0 += _hw.now() - self._paused; self._paused = None

    def reset(self):
        self._t0 = _hw.now()
        if self._paused is not None:
            self._paused = self._t0


async def _multitask(coros, race):
    ts = [rt.spawn(c) for c in coros]
    if race:
        while not any(t.done for t in ts):
            await _W(K_STEP, 0, S.stepn)
        for t in ts:
            rt.kill(t)
    else:
        await _W(K_JOIN, ts)
    return [t.result for t in ts]


def multitask(*tasks, race=False):
    return _multitask(tasks, race)


def run_task(task):
    return rt.rl_run_sync(task)


def read_input_byte():
    return None


# ------------------------------------------------------------------ hub
_NARROW = {'0': '11:11:11:11:11', '1': '01:01:01:01:01', '2': '11:01:11:10:11', '3': '11:01:11:01:11', '4': '10:10:11:01:01',
           '5': '11:10:11:01:11', '6': '10:10:11:11:11', '7': '11:01:01:01:01', '8': '11:11:00:11:11', '9': '11:11:11:01:01'}
_D3 = {'0': '111:101:101:101:111', '1': '010:110:010:010:111', '2': '111:001:111:100:111', '3': '111:001:111:001:111',
       '4': '101:101:111:001:001', '5': '111:100:111:001:111', '6': '111:100:111:101:111', '7': '111:001:010:010:010',
       '8': '111:101:111:101:111', '9': '111:101:111:001:111'}


class _Display:
    def __init__(self, hub):
        self._hub = hub; self._anim = None

    def _stop_anim(self):
        if self._anim is not None:
            rt.kill(self._anim); self._anim = None

    def orientation(self, up):
        m = {0: 0, 5: 1, 3: 2, 2: 3}.get(up._v if isinstance(up, _Const) else 0, 0)
        _hw.lm_orient(m)

    def off(self):
        self._stop_anim(); _hw.lm_clear()

    def pixel(self, row, column, brightness=100):
        self._stop_anim()
        r, c = int(row), int(column)
        if not (0 <= r <= 4 and 0 <= c <= 4):
            raise ValueError('linha e coluna vão de 0 a 4')
        _hw.lm_set(c, r, max(0, min(100, int(brightness))))

    def icon(self, icon):
        self._stop_anim()
        vals = [max(0, min(100, int(v))) for v in icon]
        if len(vals) != 25:
            raise ValueError('o ícone precisa ser uma Matrix 5x5')
        _hw.lm_show(json.dumps(vals))

    image = icon

    def number(self, number):
        self._stop_anim()
        n = int(number)
        if n < -99 or n > 99:
            raise ValueError('number vai de -99 a 99')
        px = [0] * 25
        s = str(abs(n))
        if len(s) == 1:
            rows = _D3[s].split(':')
            for y in range(5):
                for x in range(3):
                    if rows[y][x] == '1':
                        px[y * 5 + 2 + x] = 100
            if n < 0:
                px[2 * 5 + 0] = 100
        else:
            for k, ch in enumerate(s):
                rows = _NARROW[ch].split(':')
                for y in range(5):
                    for x in range(2):
                        if rows[y][x] == '1':
                            px[y * 5 + k * 3 + x] = 100
            if n < 0:
                px[2] = 100
        _hw.lm_show(json.dumps(px))

    def char(self, char):
        self._stop_anim()
        c = str(char)[:1] or ' '
        _hw.lm_write(c, 100, 10000000)

    def text(self, text, on=500, off=50):
        self._stop_anim()
        return _blocking(self._text(str(text), int(on), int(off)))

    async def _text(self, text, on, off):
        for ch in text:
            _hw.lm_write(ch, 100, 10000000)
            await _W(K_TIME, S.now + on)
            _hw.lm_clear()
            await _W(K_TIME, S.now + off)

    def animate(self, matrices, interval):
        self._stop_anim()
        frames = [json.dumps([max(0, min(100, int(v))) for v in m]) for m in matrices]

        async def run():
            k = 0
            while True:
                _hw.lm_show(frames[k % len(frames)])
                k += 1
                await _W(K_TIME, S.now + interval)
        self._anim = rt.spawn(run(), 'animate', daemon=True)


class _Light:
    def __init__(self, which):
        self._w = which; self._task = None

    def _stop(self):
        if self._task is not None:
            rt.kill(self._task); self._task = None

    def on(self, color):
        self._stop()
        _hw.light_rgb(self._w, _hsv_hex(color))

    def off(self):
        self._stop()
        _hw.light_rgb(self._w, '#000000')

    def blink(self, color, durations):
        self._stop()
        hx = _hsv_hex(color); ds = list(durations)

        async def run():
            k = 0
            while True:
                _hw.light_rgb(self._w, hx if k % 2 == 0 else '#000000')
                await _W(K_TIME, S.now + ds[k % len(ds)])
                k += 1
        self._task = rt.spawn(run(), 'blink', daemon=True)

    def animate(self, colors, interval):
        self._stop()
        cs = [_hsv_hex(c) for c in colors]

        async def run():
            k = 0
            while True:
                _hw.light_rgb(self._w, cs[k % len(cs)])
                k += 1
                await _W(K_TIME, S.now + interval)
        self._task = rt.spawn(run(), 'lanim', daemon=True)


class _Buttons:
    def pressed(self):
        cost(20)
        out = set()
        for b in (Button.LEFT, Button.RIGHT, Button.CENTER, Button.BLUETOOTH):
            if _hw.btn(b._v) > 0:
                out.add(b)
        return out


class _Speaker:
    def __init__(self):
        self._vol = 100

    def volume(self, volume=None):
        if volume is None:
            return self._vol
        self._vol = max(0, min(100, int(volume)))
        _hw.volume(self._vol)

    def beep(self, frequency=500, duration=100):
        cid = int(_hw.beep(int(frequency), int(duration), 100, 1))
        return rt.cmd_result(cid, duration > 0)

    def play_notes(self, notes, tempo=120):
        return _blocking(self._notes(list(notes), tempo))

    async def _notes(self, notes, tempo):
        base = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
        whole = 4 * 60000 / tempo
        for n in notes:
            n = n.strip()
            if not n:
                continue
            name, _, dur = n.partition('/')
            frac = dur.replace('.', '').replace('_', '')
            ms = whole / (int(frac) if frac else 4)
            if dur.endswith('.'):
                ms *= 1.5
            if name[0] == 'R':
                await _W(K_TIME, S.now + ms)
                continue
            semis = base[name[0].upper()]
            rest = name[1:]
            if rest.startswith('#'):
                semis += 1; rest = rest[1:]
            elif rest.startswith('b'):
                semis -= 1; rest = rest[1:]
            octave = int(rest) if rest else 4
            f = 440.0 * 2 ** ((semis + 12 * (octave - 4)) / 12.0)
            cid = int(_hw.beep(int(f), int(ms * 0.9), 100, 1))
            await _W(K_TIME, S.now + ms)


class _IMU:
    def __init__(self):
        self._rot = 0.0

    def ready(self):
        return True

    def stationary(self):
        return bool(_hw.imu_stable())

    def up(self):
        f = int(_hw.imu_up())
        return [Side.TOP, Side.FRONT, Side.RIGHT, Side.BOTTOM, Side.BACK, Side.LEFT][f]

    def tilt(self):
        t = json.loads(_hw.imu_tilt())
        return (int(round(t[1] / 10)), int(round(t[2] / 10)))

    def acceleration(self, axis=None):
        a = json.loads(_hw.imu_acc())
        v = vector(a[0] * 9.81, a[1] * 9.81, a[2] * 9.81)
        if axis is None:
            return v
        return sum(p * q for p, q in zip(v, axis))

    def angular_velocity(self, axis=None):
        g = json.loads(_hw.imu_gyro())
        v = vector(g[0] / 10, g[1] / 10, g[2] / 10)
        if axis is None:
            return v
        return sum(p * q for p, q in zip(v, axis))

    def heading(self):
        cost(20)
        return float(_hw.pb_heading())

    def reset_heading(self, angle):
        _hw.pb_reset_heading(float(angle))

    def rotation(self, axis):
        return -self.heading() if list(axis) == [0.0, 0.0, 1.0] else 0.0

    def orientation(self):
        h = math.radians(self.heading())
        c, s = math.cos(h), math.sin(h)
        return Matrix([[c, s, 0], [-s, c, 0], [0, 0, 1]])

    def settings(self, *a, **k):
        return (1.5, 250, 360, 360)


class _Battery:
    def voltage(self):
        return int(_hw.batt_v() * 1000)

    def current(self):
        return int(_hw.batt_i() * 1000)


class _System:
    def set_stop_button(self, button):
        if button is None:
            _hw.stop_button('none')
        elif isinstance(button, (tuple, list, set)):
            _hw.stop_button('+'.join(b._v for b in button))
        else:
            _hw.stop_button(button._v)

    def name(self):
        return 'MyFLL Prime'

    def shutdown(self):
        _hw.power_off()
        raise SystemExit

    def storage(self, offset, write=None, read=None):
        return bytes(read or 0)

    def reset_reason(self):
        return 0


class PrimeHub:
    def __init__(self, top_side=None, front_side=None, broadcast_channel=None, observe_channels=None):
        _hw.pb_reset_heading(0.0)
        self.display = _Display(self)
        self.light = _Light(0)
        self.buttons = _Buttons()
        self.speaker = _Speaker()
        self.imu = _IMU()
        self.battery = _Battery()
        self.system = _System()
        self.charger = types.SimpleNamespace(connected=lambda: False, current=lambda: 0, status=lambda: 0)
        self.ble = types.SimpleNamespace(broadcast=lambda *a: None, observe=lambda *a: None, signal_strength=lambda *a: -128, version=lambda: '5.3')


InventorHub = PrimeHub
ThisHub = PrimeHub


# ------------------------------------------------------------------ pupdevices
class _Control:
    def __init__(self, m):
        self._m = m
        self._lim = [m._maxs, 2000, 560]
        self._tol = (50, 10)
        self._stall = (20, 200)

    def limits(self, speed=None, acceleration=None, torque=None):
        if speed is None and acceleration is None and torque is None:
            return tuple(self._lim)
        if speed is not None:
            self._lim[0] = min(abs(speed), self._m._maxs)
        if acceleration is not None:
            self._lim[1] = abs(acceleration[0] if isinstance(acceleration, (tuple, list)) else acceleration)
        if torque is not None:
            self._lim[2] = torque

    def pid(self, kp=None, ki=None, kd=None, integral_deadzone=None, integral_rate=None):
        if kp is None and ki is None and kd is None:
            return (13000, 1300, 1300, 5, 100)
        return None

    def target_tolerances(self, speed=None, position=None):
        if speed is None and position is None:
            return self._tol

    def stall_tolerances(self, speed=None, time=None):
        if speed is None and time is None:
            return self._stall

    def scale(self):
        return self._m._k


class Motor:
    def __init__(self, port, positive_direction=Direction.CLOCKWISE, gears=None, reset_angle=True, profile=None):
        self._p = _need(port, ('motor',))
        self._s = positive_direction._v if isinstance(positive_direction, _Const) else 1
        g = 1.0
        if gears:
            trains = gears if isinstance(gears[0], (list, tuple)) else [gears]
            for t in trains:
                g *= float(t[-1]) / float(t[0])
        self._g = g
        self._k = self._s * g              # graus do motor por grau do usuário
        self._maxs = int(_hw.m_max(self._p) / g)
        self.control = _Control(self)
        self._p0 = 0.0
        if reset_angle:
            self.reset_angle()

    def _raw(self):
        return _hw.m_pos_f(self._p)

    def angle(self):
        cost(20)
        return int(round((self._raw() - self._p0) / self._k))

    def speed(self, window=100):
        cost(20)
        return int(round(_hw.m_vel_f(self._p) / self._k))

    def reset_angle(self, angle=None):
        if angle is None:
            angle = int(_hw.m_abs(self._p)) * self._s
            angle = ((angle + 180) % 360) - 180
        self._p0 = self._raw() - float(angle) * self._k

    def stop(self):
        _hw.m_coast(self._p)

    def brake(self):
        _hw.m_brake(self._p)

    def hold(self):
        _hw.m_hold(self._p)

    def run(self, speed):
        _hw.m_run(self._p, _num(speed, 'speed') * self._k, self.control._lim[1])

    def dc(self, duty):
        _hw.m_duty(self._p, max(-100, min(100, _num(duty, 'duty'))) * 100 * self._s)

    def _target(self, target, speed, then, wait):
        spd = abs(_num(speed, 'speed')) * abs(self._k)
        cid = int(_hw.m_traj_pb(self._p, target, spd, _stop(then), self.control._lim[1], self.control._lim[1]))
        return _wait_cmd(cid, wait)

    def run_angle(self, speed, rotation_angle, then=Stop.HOLD, wait=True):
        sgn = 1 if speed >= 0 else -1
        target = self._raw() + sgn * _num(rotation_angle, 'rotation_angle') * self._k
        return self._target(target, speed, then, wait)

    def run_target(self, speed, target_angle, then=Stop.HOLD, wait=True):
        target = self._p0 + _num(target_angle, 'target_angle') * self._k
        return self._target(target, speed, then, wait)

    def run_time(self, speed, time, then=Stop.HOLD, wait=True):
        cid = int(_hw.m_time_pb(self._p, _num(time, 'time'), _num(speed, 'speed') * self._k, _stop(then), self.control._lim[1], self.control._lim[1]))
        return _wait_cmd(cid, wait)

    def run_until_stalled(self, speed, then=Stop.COAST, duty_limit=None):
        cid = int(_hw.m_until_stalled(self._p, _num(speed, 'speed') * self._k, (duty_limit / 100.0) if duty_limit else 0))
        return _blocking(self._until_stalled(cid, then))

    async def _until_stalled(self, cid, then):
        await _W(rt.K_CMD, cid)
        _hw.m_stop(self._p, _stop(then))
        return self.angle()

    def track_target(self, target_angle):
        _hw.m_track(self._p, self._p0 + _num(target_angle, 'target_angle') * self._k)

    def done(self):
        return bool(_hw.m_done(self._p))

    def stalled(self):
        return bool(_hw.m_stalled(self._p))

    def load(self):
        return int(_hw.m_load(self._p))

    def settings(self, *a, **k):
        return None

    def model(self):
        return None


class _Lights:
    def __init__(self, port, n, fn):
        self._p = port; self._n = n; self._fn = fn

    def on(self, brightness=100):
        if isinstance(brightness, (list, tuple)):
            vals = [int(v) for v in brightness] + [0] * self._n
        else:
            vals = [int(brightness)] * self._n
        self._fn(self._p, vals[:self._n] + [0] * (4 - self._n))

    def off(self):
        self.on(0)


class ColorSensor:
    def __init__(self, port):
        self._p = _need(port, ('color',))
        self._det = [Color.RED, Color.YELLOW, Color.GREEN, Color.BLUE, Color.WHITE, Color.NONE]
        self.lights = _Lights(self._p, 3, lambda p, v: _hw.c_light(p, v[0], v[1], v[2]))

    def reflection(self):
        return int(_hw.c_refl(self._p))

    def ambient(self):
        return int(_hw.c_ambient(self._p))

    def hsv(self, surface=True):
        h, s, v = json.loads(_hw.c_hsv(self._p))
        return Color(int(h), int(s), int(v))

    def detectable_colors(self, colors=None):
        if colors is None:
            return tuple(self._det)
        self._det = list(colors)

    def color(self, surface=True):
        m = self.hsv(surface)
        best, bd = Color.NONE, 1e9
        for c in self._det:
            if c.s < 30 or m.s < 30:
                # tons neutros: compara brilho e saturação
                d = abs(c.v - m.v) * 1.2 + abs(c.s - m.s) * 0.8
            else:
                dh = abs(c.h - m.h); dh = min(dh, 360 - dh)
                d = dh * 1.5 + abs(c.s - m.s) * 0.4 + abs(c.v - m.v) * 0.3
            if m.v < 15 and c == Color.NONE:
                d = 0
            if d < bd:
                bd, best = d, c
        return best


class UltrasonicSensor:
    def __init__(self, port):
        self._p = _need(port, ('distance',))
        self.lights = _Lights(self._p, 4, lambda p, v: _hw.d_lights(p, v[0], v[1], v[2], v[3]))

    def distance(self):
        d = int(_hw.d_dist(self._p))
        return 2000 if d < 0 else d

    def presence(self):
        return False


class ForceSensor:
    def __init__(self, port):
        self._p = _need(port, ('force',))

    def force(self):
        return round(float(_hw.f_force(self._p)), 2)

    def distance(self):
        return round(float(_hw.f_travel(self._p)), 2)

    def pressed(self, force=3):
        return float(_hw.f_force(self._p)) >= force

    def touched(self):
        return float(_hw.f_force(self._p)) > 0.15


# ------------------------------------------------------------------ robotics
class DriveBase:
    def __init__(self, left_motor, right_motor, wheel_diameter, axle_track):
        if not isinstance(left_motor, Motor) or not isinstance(right_motor, Motor):
            raise TypeError('DriveBase precisa de dois objetos Motor')
        self._L = left_motor; self._R = right_motor
        self._d = float(wheel_diameter); self._t = float(axle_track)
        self._i = int(_hw.db_new(left_motor._p, right_motor._p, left_motor._k, right_motor._k, self._d, self._t))
        if self._i < 0:
            raise OSError(19, 'ENODEV')

    def straight(self, distance, then=Stop.HOLD, wait=True):
        cid = int(_hw.db_straight(self._i, _num(distance, 'distance'), _stop(then)))
        return _wait_cmd(cid, wait)

    def turn(self, angle, then=Stop.HOLD, wait=True):
        cid = int(_hw.db_turn(self._i, _num(angle, 'angle'), _stop(then)))
        return _wait_cmd(cid, wait)

    def curve(self, radius, angle, then=Stop.HOLD, wait=True):
        cid = int(_hw.db_curve(self._i, _num(radius, 'radius'), _num(angle, 'angle'), _stop(then)))
        return _wait_cmd(cid, wait)

    def arc(self, radius, angle=None, distance=None, then=Stop.HOLD, wait=True):
        if angle is None and distance is None:
            raise TypeError('arc precisa de angle ou distance')
        if angle is None:
            angle = math.degrees(distance / radius) if radius else 0
        return self.curve(radius, angle, then, wait)

    def drive(self, speed, turn_rate):
        _hw.db_drive(self._i, _num(speed, 'speed'), _num(turn_rate, 'turn_rate'))

    def stop(self):
        _hw.db_stop(self._i, 0)

    def brake(self):
        _hw.db_stop(self._i, 1)

    def distance(self):
        return int(round(json.loads(_hw.db_state(self._i))[0]))

    def angle(self):
        return int(round(json.loads(_hw.db_state(self._i))[2]))

    def state(self):
        s = json.loads(_hw.db_state(self._i))
        return (int(round(s[0])), int(round(s[1])), int(round(s[2])), int(round(s[3])))

    def reset(self, distance=0, angle=0):
        _hw.db_reset(self._i, float(distance), float(angle))

    def settings(self, straight_speed=None, straight_acceleration=None, turn_rate=None, turn_acceleration=None):
        f = lambda v: -1 if v is None else abs(float(v if not isinstance(v, (list, tuple)) else v[0]))
        r = json.loads(_hw.db_settings(self._i, f(straight_speed), f(straight_acceleration), f(turn_rate), f(turn_acceleration)))
        if straight_speed is None and straight_acceleration is None and turn_rate is None and turn_acceleration is None:
            return tuple(int(v) for v in r)

    def use_gyro(self, use_gyro):
        _hw.db_gyro(self._i, bool(use_gyro))

    def done(self):
        return bool(_hw.db_done(self._i))

    def stalled(self):
        return bool(_hw.db_stalled(self._i))


GyroDriveBase = DriveBase


# ------------------------------------------------------------------ hub_menu
def hub_menu(*symbols):
    if not symbols:
        raise ValueError('hub_menu precisa de pelo menos um símbolo')
    return _blocking(_menu([str(s) for s in symbols], symbols))


async def _menu(labels, symbols):
    k = 0
    old = _hw.get_stop_button()
    _hw.stop_button('bt')

    def show():
        _hw.lm_write(labels[k][:1], 100, 10000000)
    show()
    # espera soltar tudo
    while _hw.btn('left') or _hw.btn('right') or _hw.btn('center'):
        await _W(K_STEP, 0, S.stepn)
    while True:
        if _hw.btn('left'):
            k = (k - 1) % len(labels); show(); _hw.beep(700, 40, 60, 1)
            while _hw.btn('left'):
                await _W(K_STEP, 0, S.stepn)
        elif _hw.btn('right'):
            k = (k + 1) % len(labels); show(); _hw.beep(700, 40, 60, 1)
            while _hw.btn('right'):
                await _W(K_STEP, 0, S.stepn)
        elif _hw.btn('center'):
            while _hw.btn('center'):
                await _W(K_STEP, 0, S.stepn)
            _hw.beep(1000, 60, 60, 1)
            _hw.lm_clear()
            _hw.stop_button(old)
            return symbols[k]
        await _W(K_TIME, S.now + 10)


# ------------------------------------------------------------------ registro
pyb = _mod('pybricks')
pyb.version = ('primehub', '3.6.0', 'MyFLL.lab')
m_hubs = _mod('pybricks.hubs'); m_hubs.PrimeHub = PrimeHub; m_hubs.InventorHub = InventorHub; m_hubs.ThisHub = ThisHub
m_pup = _mod('pybricks.pupdevices')
for _c in (Motor, ColorSensor, UltrasonicSensor, ForceSensor):
    setattr(m_pup, _c.__name__, _c)
m_par = _mod('pybricks.parameters')
for _n, _v in (('Port', Port), ('Direction', Direction), ('Stop', Stop), ('Color', Color), ('Button', Button), ('Side', Side), ('Axis', Axis), ('Icon', Icon)):
    setattr(m_par, _n, _v)
m_rob = _mod('pybricks.robotics'); m_rob.DriveBase = DriveBase; m_rob.GyroDriveBase = GyroDriveBase
m_tools = _mod('pybricks.tools')
for _n, _v in (('wait', wait), ('StopWatch', StopWatch), ('multitask', multitask), ('run_task', run_task), ('hub_menu', hub_menu),
               ('read_input_byte', read_input_byte), ('Matrix', Matrix), ('vector', vector), ('cross', cross)):
    setattr(m_tools, _n, _v)
m_geo = _mod('pybricks.geometry'); m_geo.Matrix = Matrix; m_geo.vector = vector; m_geo.Axis = Axis
m_io = _mod('pybricks.iodevices')
for _n in ('hubs', 'pupdevices', 'parameters', 'robotics', 'tools', 'geometry', 'iodevices'):
    setattr(pyb, _n, rt.VMODS['pybricks.' + _n])
