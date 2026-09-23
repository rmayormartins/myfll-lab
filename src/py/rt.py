# ============================================================================
#  MyFLL.lab :: rt.py
#  Núcleo de execução do "hub": agendador cooperativo determinístico em tempo
#  virtual, transformação do código do aluno (pontos de espera em laços e em
#  funções que bloqueiam) e utilidades (saída, erros, importação).
# ============================================================================
import sys, ast, types, builtins, traceback, functools, math

import _hw

_cmd_done = _hw.cmd_done
_cmd_status = _hw.cmd_status
_sync_step = _hw.sync_step
_now = _hw.now

K_TIME, K_CMD, K_STEP, K_JOIN, K_TICK = 1, 2, 3, 4, 5
STEP_US = 1000      # orçamento de CPU por passo de 1 ms
LOOP_US = 45        # custo de uma volta de laço
CALL_US = 30


class _W:
    """Condição de espera: o que a tarefa aguarda para continuar."""
    __slots__ = ('k', 'a', 'b', 'auto')

    def __init__(self, k, a=0, b=0):
        self.k = k; self.a = a; self.b = b; self.auto = False

    def __await__(self):
        r = yield self
        return r


class _NoWait:
    __slots__ = ()

    def __await__(self):
        return iter(())


_NOWAIT = _NoWait()


class Cmd:
    """Aguardável devolvido pelos comandos de motor, som e matriz."""
    __slots__ = ('id', 'auto', 'value')

    def __init__(self, cid, auto=False, value=None):
        self.id = cid; self.auto = auto; self.value = value

    def __await__(self):
        if self.id <= 0:
            return self.value
        r = yield _W(K_CMD, self.id)
        return r if self.value is None else self.value

    def __repr__(self):
        return '<awaitable>'


class _SyncCoro:
    """Resultado de uma função comum convertida para cooperativa."""
    __slots__ = ('coro',)

    def __init__(self, coro):
        self.coro = coro

    def __await__(self):
        return self.coro.__await__()

    def __bool__(self):
        # usado como condição sem ser executado: executa de forma bloqueante
        return bool(_run_sync(self.coro))


class Task:
    __slots__ = ('coro', 'w', 'done', 'result', 'exc', 'name', 'id', 'val', 'daemon')
    _seq = 0

    def __init__(self, coro, name='', daemon=False):
        Task._seq += 1
        self.id = Task._seq
        self.coro = coro; self.w = _W(K_STEP, 0, -1); self.done = False
        self.result = None; self.exc = None; self.name = name; self.val = None; self.daemon = daemon


class _State:
    def __init__(self):
        self.tasks = []
        self.cpu = 0
        self.stepn = 0
        self.now = 0.0
        self.error = None
        self.direct = 0
        self.mode = 'spike'          # 'spike' | 'pybricks' | 'pybricks_async'
        self.running = False
        self.globals = None
        self.stop_req = False


S = _State()


def take_direct():
    d = S.direct
    S.direct = 0
    return d


def cost(us):
    S.cpu += us


# ------------------------------------------------------------------ espera
def _check(w):
    k = w.k
    if k == K_TIME:
        return (S.now >= w.a - 1e-7), None
    if k == K_CMD:
        if _cmd_done(w.a):
            return True, _cmd_status(w.a)
        return False, None
    if k == K_STEP or k == K_TICK:
        return (S.stepn > w.b), None
    if k == K_JOIN:
        for t in w.a:
            if not t.done:
                return False, None
        return True, None
    return True, None


def tick():
    S.cpu += LOOP_US
    if S.cpu >= STEP_US:
        return _W(K_TICK, 0, S.stepn)
    return _NOWAIT


def tick_sync():
    S.cpu += LOOP_US
    if S.cpu >= STEP_US:
        sync_step()


def sync_step():
    S.cpu = 0
    _sync_step()
    S.now = _now()
    S.stepn += 1
    if S.stop_req:
        raise SystemExit


def sync_wait(w):
    """Bloqueia (avançando a física) até a condição ficar verdadeira."""
    if w.k in (K_TICK, K_STEP):
        sync_step()
        return None
    while True:
        ok, v = _check(w)
        if ok:
            return v
        sync_step()


def _run_sync(coro):
    val = None
    while True:
        try:
            w = coro.send(val)
        except StopIteration as e:
            return e.value
        if not isinstance(w, _W):
            raise TypeError('objeto aguardável não suportado no hub')
        val = sync_wait(w)


def _run_sync_many(coros):
    ts = [Task(c) for c in coros]
    while True:
        prog = False
        for t in ts:
            if t.done:
                continue
            ok, v = _check(t.w)
            if ok:
                prog = True
                try:
                    w = t.coro.send(v)
                except StopIteration as e:
                    t.done = True; t.result = e.value
                    continue
                if not isinstance(w, _W):
                    raise TypeError('objeto aguardável não suportado no hub')
                if w.k == K_TICK or w.k == K_STEP:
                    w = _W(w.k, 0, S.stepn)
                t.w = w
        if all(t.done for t in ts):
            return [t.result for t in ts]
        if not prog or S.cpu >= STEP_US:
            sync_step()


# ------------------------------------------------------------------ agendador
def spawn(coro, name='', daemon=False):
    if not hasattr(coro, 'send'):
        if isinstance(coro, _SyncCoro):
            coro = coro.coro
        elif hasattr(coro, '__await__'):
            coro = _wrap_await(coro)
        else:
            raise TypeError('runloop.run espera chamadas de funções async, por exemplo runloop.run(main())')
    t = Task(coro, name, daemon)
    S.tasks.append(t)
    return t


async def _wrap_await(a):
    return await a


def kill(t):
    if t and not t.done:
        t.done = True
        try:
            t.coro.close()
        except BaseException:
            pass


def _resume(t, val):
    try:
        w = t.coro.send(val)
    except StopIteration as e:
        t.done = True; t.result = e.value
        return
    except SystemExit:
        t.done = True
        S.error = 'exit'
        return
    except BaseException as e:
        t.done = True; t.exc = e
        S.error = e
        return
    if not isinstance(w, _W):
        t.done = True
        S.error = TypeError('você usou await em algo que não é um comando do hub (' + type(w).__name__ + ')')
        return
    if w.k == K_TICK or w.k == K_STEP:
        if w.b != S.stepn:
            w = _W(w.k, 0, S.stepn)
    t.w = w


def step(now):
    """Chamado pelo JS a cada passo em que algo pode acordar. Devolve:
    -1 fim normal, -2 erro, ou o instante (ms) do próximo despertar."""
    S.now = now
    S.stepn += 1
    S.cpu = 0
    rounds = 0
    while rounds < 60:
        rounds += 1
        prog = False
        for t in list(S.tasks):
            if t.done:
                continue
            ok, v = _check(t.w)
            if not ok:
                continue
            prog = True
            S.cpu += CALL_US
            _resume(t, v)
            if S.error is not None:
                return -2.0
            if S.cpu >= STEP_US:
                break
        if not prog or S.cpu >= STEP_US:
            break
    S.tasks = [t for t in S.tasks if not t.done]
    if not S.tasks or all(t.daemon for t in S.tasks):
        for t in S.tasks:
            kill(t)
        S.tasks = []
        return -1.0
    wake = 1e18
    for t in S.tasks:
        k = t.w.k
        if k == K_TIME:
            if t.w.a < wake:
                wake = t.w.a
        elif k == K_STEP or k == K_TICK:
            wake = now + 0.5
            break
    return wake


def stop_all():
    S.stop_req = True
    for t in S.tasks:
        try:
            t.coro.close()
        except BaseException:
            pass
    S.tasks = []
    S.running = False


# ------------------------------------------------------------------ chamadas envoltas
async def call(f, *a, **k):
    S.direct = 1
    try:
        r = f(*a, **k)
    finally:
        S.direct = 0
    if type(r) is _SyncCoro:
        return await r.coro
    if (type(r) is Cmd or type(r) is _W) and r.auto:
        return await r
    return r


def call_sync(f, *a, **k):
    S.direct = 2
    try:
        r = f(*a, **k)
    finally:
        S.direct = 0
    if type(r) is _SyncCoro:
        return _run_sync(r.coro)
    return r


def sync2async(fn):
    @functools.wraps(fn)
    def w(*a, **k):
        return _SyncCoro(fn(*a, **k))
    return w


async def rl_run(*coros):
    ts = [spawn(c) for c in coros]
    await _W(K_JOIN, ts)
    return None


def rl_run_sync(*coros):
    _run_sync_many([c.coro if isinstance(c, _SyncCoro) else c for c in coros])
    return None


# ------------------------------------------------------------------ esperas públicas
def sleep_ms_await(ms):
    ms = float(ms)
    if ms < 0:
        ms = 0
    return _W(K_TIME, S.now + ms)


def block_or_await(w):
    """Para funções que no hub real bloqueiam (time.sleep, wait do Pybricks)."""
    d = take_direct()
    if d == 1:
        w.auto = True
        return w
    if S.mode == 'pybricks_async' and d == 0:
        return w
    sync_wait(w)
    return None


def cmd_result(cid, blocking):
    """Comando que no Pybricks bloqueia por padrão (wait=True)."""
    d = take_direct()
    c = Cmd(cid)
    if not blocking:
        return None if S.mode != 'pybricks_async' else Cmd(0, value=None)
    if d == 1:
        c.auto = True
        return c
    if S.mode == 'pybricks_async' and d == 0:
        return c
    if cid > 0:
        sync_wait(_W(K_CMD, cid))
    return None


# ------------------------------------------------------------------ transformação
BLOCK_SPIKE = {'sleep', 'sleep_ms', 'sleep_us'}
BLOCK_PB = {'wait', 'straight', 'turn', 'curve', 'arc', 'run_time', 'run_angle', 'run_target', 'run_until_stalled',
            'beep', 'play_notes', 'text', 'hub_menu', 'sleep', 'sleep_ms', 'sleep_us'}


def _callee(fn):
    if isinstance(fn, ast.Name):
        return fn.id
    if isinstance(fn, ast.Attribute):
        return fn.attr
    return None


class _FnInfo:
    __slots__ = ('node', 'loop', 'calls', 'gen', 'ok')


class _Scan(ast.NodeVisitor):
    def __init__(self):
        self.fns = []
        self.stack = []
        self.rl_names = {'run'} if False else set()

    def visit_FunctionDef(self, node):
        info = _FnInfo()
        info.node = node; info.loop = False; info.calls = set(); info.gen = False
        deco_ok = all(isinstance(d, ast.Name) and d.id in ('staticmethod', 'classmethod') for d in node.decorator_list)
        info.ok = deco_ok and not (node.name.startswith('__') and node.name.endswith('__'))
        self.fns.append(info)
        self.stack.append(info)
        for s in node.body:
            self.visit(s)
        self.stack.pop()

    def visit_AsyncFunctionDef(self, node):
        self.stack.append(None)
        for s in node.body:
            self.visit(s)
        self.stack.pop()

    def visit_Lambda(self, node):
        self.stack.append(None)
        self.visit(node.body)
        self.stack.pop()

    def _cur(self):
        return self.stack[-1] if self.stack else None

    def visit_While(self, node):
        c = self._cur()
        if c is not None:
            c.loop = True
        self.generic_visit(node)

    visit_For = visit_While

    def visit_Yield(self, node):
        c = self._cur()
        if c is not None:
            c.gen = True
        self.generic_visit(node)

    visit_YieldFrom = visit_Yield

    def visit_Call(self, node):
        c = self._cur()
        if c is not None:
            n = _callee(node.func)
            if n:
                c.calls.add(n)
        self.generic_visit(node)


class _Xf(ast.NodeTransformer):
    def __init__(self, conv, wrap, rl_aliases, rt_aliases):
        self.conv = conv            # ids de FunctionDef a converter
        self.wrap = wrap            # nomes de funções a envolver
        self.rl = rl_aliases        # nomes que significam runloop.run
        self.rt = rt_aliases        # nomes que significam run_task (Pybricks)
        self.ctx = ['a']

    def _async(self):
        return self.ctx[-1] == 'a'

    def _tick(self, node):
        if self._async():
            st = ast.Expr(ast.Await(ast.Call(ast.Name('_mf_t', ast.Load()), [], [])))
        else:
            st = ast.Expr(ast.Call(ast.Name('_mf_ts', ast.Load()), [], []))
        return ast.copy_location(st, node)

    def _body(self, stmts):
        out = []
        for s in stmts:
            r = self.visit(s)
            if r is None:
                continue
            if isinstance(r, list):
                out.extend(r)
            else:
                out.append(r)
        return out

    def visit_FunctionDef(self, node):
        node.decorator_list = [self.visit(d) for d in node.decorator_list]
        node.args = self.visit(node.args)
        if id(node) in self.conv:
            self.ctx.append('a')
            body = self._body(node.body)
            self.ctx.pop()
            kw = dict(name=node.name, args=node.args, body=body or [ast.Pass()],
                      decorator_list=node.decorator_list + [ast.Name('_mf_s2a', ast.Load())], returns=node.returns)
            try:
                new = ast.AsyncFunctionDef(**kw, type_params=getattr(node, 'type_params', []))
            except TypeError:
                new = ast.AsyncFunctionDef(**kw)
            return ast.copy_location(new, node)
        self.ctx.append('s')
        node.body = self._body(node.body) or [ast.Pass()]
        self.ctx.pop()
        return node

    def visit_AsyncFunctionDef(self, node):
        node.decorator_list = [self.visit(d) for d in node.decorator_list]
        self.ctx.append('a')
        node.body = self._body(node.body) or [ast.Pass()]
        self.ctx.pop()
        return node

    def visit_ClassDef(self, node):
        node.bases = [self.visit(b) for b in node.bases]
        self.ctx.append('s')
        node.body = self._body(node.body) or [ast.Pass()]
        self.ctx.pop()
        return node

    def visit_Lambda(self, node):
        self.ctx.append('s')
        node.body = self.visit(node.body)
        self.ctx.pop()
        return node

    def visit_GeneratorExp(self, node):
        self.ctx.append('s')
        self.generic_visit(node)
        self.ctx.pop()
        return node

    def visit_While(self, node):
        node.test = self.visit(node.test)
        node.body = [self._tick(node)] + self._body(node.body)
        node.orelse = self._body(node.orelse)
        return node

    def visit_For(self, node):
        node.target = self.visit(node.target)
        node.iter = self.visit(node.iter)
        node.body = [self._tick(node)] + self._body(node.body)
        node.orelse = self._body(node.orelse)
        return node

    def visit_AsyncFor(self, node):
        self.generic_visit(node)
        return node

    def visit_Await(self, node):
        v = node.value
        if isinstance(v, ast.Call):
            v.func = self.visit(v.func)
            v.args = [self.visit(a) for a in v.args]
            v.keywords = [self.visit(k) for k in v.keywords]
            # await runloop.run(...) (raro) continua valendo
            return node
        node.value = self.visit(v)
        return node

    def _is_rl(self, fn):
        if isinstance(fn, ast.Attribute) and fn.attr == 'run' and isinstance(fn.value, ast.Name) and fn.value.id == 'runloop':
            return True
        if isinstance(fn, ast.Name) and fn.id in self.rl:
            return True
        return False

    def _is_rt(self, fn):
        return isinstance(fn, ast.Name) and fn.id in self.rt

    def visit_Call(self, node):
        node.func = self.visit(node.func)
        node.args = [self.visit(a) for a in node.args]
        node.keywords = [self.visit(k) for k in node.keywords]
        if self._is_rl(node.func) or self._is_rt(node.func):
            if self._async():
                c = ast.Call(ast.Name('_mf_rl', ast.Load()), node.args, node.keywords)
                return ast.copy_location(ast.Await(ast.copy_location(c, node)), node)
            c = ast.Call(ast.Name('_mf_rl_sync', ast.Load()), node.args, node.keywords)
            return ast.copy_location(c, node)
        name = _callee(node.func)
        if name and name in self.wrap:
            if self._async():
                c = ast.Call(ast.Name('_mf_call', ast.Load()), [node.func] + node.args, node.keywords)
                return ast.copy_location(ast.Await(ast.copy_location(c, node)), node)
            c = ast.Call(ast.Name('_mf_call_sync', ast.Load()), [node.func] + node.args, node.keywords)
            return ast.copy_location(c, node)
        return node


def _aliases(tree, mod, name):
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.ImportFrom) and n.module == mod:
            for a in n.names:
                if a.name == name:
                    out.add(a.asname or a.name)
    return out


def transform(tree, mode):
    sc = _Scan()
    sc.visit(tree)
    block = BLOCK_PB if mode == 'pybricks' else BLOCK_SPIKE
    conv_names = set()
    conv = set()
    changed = True
    while changed:
        changed = False
        for f in sc.fns:
            if id(f.node) in conv or not f.ok or f.gen:
                continue
            if f.loop or (f.calls & (conv_names | block)):
                conv.add(id(f.node)); conv_names.add(f.node.name); changed = True
    wrap = conv_names | block
    rl = _aliases(tree, 'runloop', 'run')
    rt = _aliases(tree, 'pybricks.tools', 'run_task')
    xf = _Xf(conv, wrap, rl, rt)
    if isinstance(tree, ast.Module):
        tree.body = xf._body(tree.body)
        tree.body.append(ast.Expr(ast.Await(ast.Call(ast.Name('_mf_t', ast.Load()), [], []))))
    else:
        tree.body = xf._body(tree.body)
    ast.fix_missing_locations(tree)
    return tree


# ------------------------------------------------------------------ saída
class _Out:
    def __init__(self, err):
        self.err = err

    def write(self, s):
        if s:
            _hw.out(str(s), 1 if self.err else 0)
        return len(s)

    def flush(self):
        pass


sys.stdout = _Out(False)
sys.stderr = _Out(True)


# ------------------------------------------------------------------ importação virtual
VMODS = {}
_real_import = builtins.__import__
_BLOCKED = {'js', 'pyodide', 'pyodide_js', '_hw', 'rt', 'micropip', 'spike', 'pybricks_impl'}


def _imp(name, g=None, l=None, fromlist=(), level=0):
    if level == 0:
        if name in VMODS:
            m = VMODS[name]
            if fromlist:
                return m
            return VMODS[name.split('.')[0]]
        top = name.split('.')[0]
        if top in _BLOCKED or top.startswith('_spk') or top.startswith('_pb'):
            raise ImportError("no module named '" + name + "'")
    return _real_import(name, g, l, fromlist, level)


def register(name, mod):
    VMODS[name] = mod


def _input(*a):
    raise OSError('input() não existe no hub: use os botões ou sensores')


def make_globals():
    b = dict(builtins.__dict__)
    b['__import__'] = _imp
    b['input'] = _input
    g = {'__name__': '__main__', '__builtins__': b,
         '_mf_t': tick, '_mf_ts': tick_sync, '_mf_call': call, '_mf_call_sync': call_sync,
         '_mf_s2a': sync2async, '_mf_rl': rl_run, '_mf_rl_sync': rl_run_sync}
    return g


# ------------------------------------------------------------------ erros
_HINTS = {
    'NameError': 'Nome não definido: confira se escreveu certo e se fez o import (ex.: from hub import port).',
    'AttributeError': 'Esse módulo ou objeto não tem esse nome. Veja o MANUAL para a lista de funções.',
    'TypeError': 'Tipo ou quantidade de argumentos errada. Confira a assinatura da função no MANUAL.',
    'ValueError': 'Valor fora do permitido (ex.: porta, cor ou faixa de velocidade).',
    'OSError': 'Nenhum dispositivo compatível nessa porta. Confira as portas no painel do hub.',
    'IndentationError': 'Problema de indentação: use 4 espaços por nível, sem misturar com tab.',
    'SyntaxError': 'Erro de sintaxe: falta ":" , parêntese ou aspas?',
    'ZeroDivisionError': 'Divisão por zero.',
    'IndexError': 'Índice fora da lista.',
    'KeyError': 'Chave não existe no dicionário.',
    'RecursionError': 'Função chamando a si mesma sem parar.',
}


def fmt_exc(e, fname='<programa>', src=None):
    lines = ['Traceback (most recent call last):']
    tb = traceback.extract_tb(e.__traceback__) if e.__traceback__ else []
    srcl = src.split('\n') if src else []
    for fr in tb:
        if fr.filename not in ('<programa>', '<console>'):
            continue
        nm = fr.name
        if nm == '<module>':
            nm = '<module>'
        lines.append('  File "%s", line %d, in %s' % (fr.filename.strip('<>'), fr.lineno, nm))
        ln = fr.line or (srcl[fr.lineno - 1].strip() if 0 < fr.lineno <= len(srcl) else '')
        if ln:
            lines.append('    ' + ln)
    msg = str(e)
    lines.append(type(e).__name__ + (': ' + msg if msg else ''))
    h = _HINTS.get(type(e).__name__)
    if h:
        lines.append('  dica: ' + h)
    uline = 0
    for fr in tb:
        if fr.filename == fname:
            uline = fr.lineno
    return '\n'.join(lines), uline


def fmt_syntax(e, src):
    ln = e.lineno or 0
    col = e.offset or 0
    srcl = src.split('\n')
    out = ['  File "programa", line %d' % ln]
    if 0 < ln <= len(srcl):
        out.append('    ' + srcl[ln - 1])
        out.append('    ' + ' ' * max(0, col - 1) + '^')
    out.append('%s: %s' % (type(e).__name__, e.msg))
    h = _HINTS.get(type(e).__name__)
    if h:
        out.append('  dica: ' + h)
    return '\n'.join(out), ln


# ------------------------------------------------------------------ início e REPL
_reset_hooks = []


def on_reset(fn):
    _reset_hooks.append(fn)
    return fn


def detect_mode(src, dialect):
    if dialect == 'pybricks':
        if 'run_task' in src or 'async def' in src:
            return 'pybricks_async'
        return 'pybricks'
    return 'spike'


def start(src, dialect):
    """Compila e agenda o programa. Devolve '' se ok, ou 'linha|mensagem' de erro."""
    S.tasks = []; S.error = None; S.stop_req = False; S.direct = 0
    S.mode = detect_mode(src, dialect)
    for h in _reset_hooks:
        h()
    try:
        tree = ast.parse(src, '<programa>', 'exec')
    except SyntaxError as e:
        msg, ln = fmt_syntax(e, src)
        return '%d|%s' % (ln, msg)
    try:
        tree = transform(tree, 'pybricks' if S.mode == 'pybricks' else 'spike')
        code = compile(tree, '<programa>', 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    except SyntaxError as e:
        msg, ln = fmt_syntax(e, src)
        return '%d|%s' % (ln, msg)
    g = make_globals()
    S.globals = g
    S.src = src
    co = eval(code, g)
    S.now = _now()
    if co is not None:
        spawn(co, '<module>')
    S.running = True
    return ''


def error_text():
    e = S.error
    if e is None or e == 'exit':
        return '0|'
    if isinstance(e, SyntaxError):
        msg, ln = fmt_syntax(e, getattr(S, 'src', ''))
        return '%d|%s' % (ln, msg)
    msg, ln = fmt_exc(e, '<programa>', getattr(S, 'src', ''))
    return '%d|%s' % (ln, msg)


_repl_g = None


def repl(line):
    """Executa uma linha do console. Devolve '' ou mensagem de erro."""
    global _repl_g
    S.error = None; S.stop_req = False
    g = S.globals if S.globals is not None else None
    if g is None:
        if _repl_g is None:
            _repl_g = make_globals()
        g = _repl_g
    try:
        tree = ast.parse(line, '<console>', 'single')
        tree = transform(tree, 'pybricks' if S.mode == 'pybricks' else 'spike')
        code = compile(tree, '<console>', 'single', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    except SyntaxError as e:
        msg, ln = fmt_syntax(e, line)
        return msg.replace('programa', 'console')
    try:
        co = eval(code, g)
    except BaseException as e:
        return fmt_exc(e, '<console>', line)[0]
    if co is not None and hasattr(co, 'send'):
        S.now = _now()
        spawn(co, '<console>')
        S.running = True
    return ''
