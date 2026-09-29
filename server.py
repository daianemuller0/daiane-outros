#!/usr/bin/env python3
# Sistema de Produção de Aulas - TI TOTAL (app local)
# Guarda os dados em db.json (nesta mesma pasta). A IA também edita esse db.json.
# Suporta upload de arquivos (ex.: caderno em PDF com gabarito) na pasta uploads/,
# que a IA consegue ler.
import http.server, socketserver, json, os, re, webbrowser, threading, time, socket, subprocess
from urllib.parse import urlparse, parse_qs, unquote
DIRP = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(DIRP, 'db.json')
UPLOADS = os.path.join(DIRP, 'uploads')
PORT = 8756

def load_db():
    if os.path.exists(DB):
        try:
            with open(DB, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'aulas': []}

def safe_name(name):
    name = os.path.basename(name or 'arquivo')
    name = re.sub(r'[^A-Za-z0-9 ._()\-À-ſ]', '_', name).strip()
    return name or 'arquivo'

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIRP, **k)
    def guess_type(self, path):
        t = super().guess_type(path)
        base = t.split(';')[0].strip() if isinstance(t, str) else t
        if base in ('text/html', 'text/css', 'application/javascript', 'text/javascript', 'application/json', 'text/plain'):
            return base + '; charset=utf-8'
        return t
    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_GET(self):
        p = urlparse(self.path)
        if p.path == '/api/db':
            return self._json(load_db())
        if p.path == '/api/uploads':
            q = parse_qs(p.query)
            aula = safe_name(q.get('aula', [''])[0]) if q.get('aula') else ''
            base = os.path.join(UPLOADS, aula) if aula else UPLOADS
            out = []
            if os.path.isdir(base):
                for fn in sorted(os.listdir(base)):
                    fp = os.path.join(base, fn)
                    if os.path.isfile(fp):
                        out.append({'name': fn, 'size': os.path.getsize(fp),
                                    'url': '/uploads/%s/%s' % (aula, fn) if aula else '/uploads/%s' % fn})
            return self._json({'files': out})
        if self.path == '/' or self.path == '':
            self.path = '/index.html'
        return super().do_GET()
    def do_POST(self):
        p = urlparse(self.path)
        if p.path == '/api/db':
            try:
                n = int(self.headers.get('Content-Length', 0))
                data = json.loads(self.rfile.read(n).decode('utf-8'))
                tmp = DB + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=1)
                os.replace(tmp, DB)
                return self._json({'ok': True})
            except Exception as e:
                return self._json({'ok': False, 'error': str(e)}, 500)
        if p.path == '/api/upload':
            try:
                q = parse_qs(p.query)
                aula = safe_name(q.get('aula', ['geral'])[0])
                name = safe_name(unquote(q.get('name', ['arquivo'])[0]))
                dest_dir = os.path.join(UPLOADS, aula)
                os.makedirs(dest_dir, exist_ok=True)
                n = int(self.headers.get('Content-Length', 0))
                # read body in chunks
                remaining = n
                dest = os.path.join(dest_dir, name)
                with open(dest, 'wb') as f:
                    while remaining > 0:
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)
                return self._json({'ok': True, 'name': name, 'size': os.path.getsize(dest),
                                   'url': '/uploads/%s/%s' % (aula, name)})
            except Exception as e:
                return self._json({'ok': False, 'error': str(e)}, 500)
        self.send_error(404)
    def log_message(self, *a):
        pass

if not os.path.exists(DB):
    with open(DB, 'w', encoding='utf-8') as f:
        json.dump({'aulas': []}, f, ensure_ascii=False, indent=1)
os.makedirs(UPLOADS, exist_ok=True)

def free_port(port):
    """Encerra instância antiga do servidor que esteja ocupando a porta (macOS/Linux)."""
    try:
        out = subprocess.run(['lsof', '-ti', 'tcp:%d' % port],
                             capture_output=True, text=True, timeout=5).stdout.split()
        killed = False
        for pid in out:
            try:
                os.kill(int(pid), 9); killed = True
            except Exception:
                pass
        if killed:
            time.sleep(1)
    except Exception:
        pass

def can_bind(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind(("127.0.0.1", port)); return True
    except OSError:
        return False
    finally:
        s.close()

# libera a porta padrão (mata servidor antigo) ou escolhe a próxima livre
free_port(PORT)
if not can_bind(PORT):
    for p in range(PORT + 1, PORT + 30):
        if can_bind(p):
            PORT = p; break

URL = 'http://localhost:%d' % PORT
print("\n  Sistema de Produção de Aulas — TI TOTAL")
print("  Rodando em:  %s" % URL)
print("  Deixe esta janela ABERTA enquanto usa o sistema.")
print("  Para encerrar: feche esta janela.\n")
threading.Thread(target=lambda: (time.sleep(1), webbrowser.open(URL)), daemon=True).start()
socketserver.TCPServer.allow_reuse_address = True
try:
    with socketserver.TCPServer(("127.0.0.1", PORT), H) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
except OSError as e:
    print("  Não foi possível iniciar o servidor: %s" % e)
    print("  Feche outras janelas do sistema e tente de novo.")
    input("  Pressione Enter para fechar...")
