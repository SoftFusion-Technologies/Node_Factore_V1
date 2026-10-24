"""Pruebas aisladas: adapta SQL generado por Sequelize/MySQL a SQLite en memoria.
No usa las credenciales del .env ni se conecta a MySQL DESA.
"""
import sys, re, json, sqlite3, datetime, pathlib

def utc(precision=3):
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]

def adaptar(sql):
    # SQLite admite comillas SQL duplicadas; MySQL usa escapes de barra inversa.
    result, i = '', 0
    while i < len(sql):
        if sql[i] != "'":
            result += sql[i]; i += 1; continue
        i += 1; value = ''
        while i < len(sql):
            ch = sql[i]; i += 1
            if ch == '\\' and i < len(sql):
                escaped = sql[i]; i += 1
                value += {'n':'\n','r':'\r','t':'\t','0':'\0'}.get(escaped, escaped)
            elif ch == "'":
                if i < len(sql) and sql[i] == "'": value += "'"; i += 1
                else: break
            else: value += ch
        result += "'" + value.replace("'", "''") + "'"
    result = re.sub(r'\s+(FOR UPDATE|LOCK IN SHARE MODE)\b', '', result, flags=re.I)
    result = re.sub(r'CURRENT_TIMESTAMP\(3\)', 'UTC_TIMESTAMP(3)', result, flags=re.I)
    result = re.sub(r'^START TRANSACTION', 'BEGIN TRANSACTION', result, flags=re.I)
    result = re.sub(r'(?<=[(,])\s*DEFAULT(?=\s*[,)])', 'NULL', result, flags=re.I)
    return result

db = sqlite3.connect(':memory:', isolation_level=None)
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
db.create_function('UTC_TIMESTAMP', 1, utc)
# Benjamin Orellana - 20/10/2026 - Hora y fixtures de Agenda en memoria.
db.create_function('SECOND', 1, lambda value: int(str(value).split(':')[2].split('.')[0]))
db.create_function('CHAR_LENGTH', 1, lambda value: None if value is None else len(value))
for name in (sys.argv[1:] or ['crm.sqlite.sql']):
    fixture = pathlib.Path(name)
    if fixture.name != str(fixture): raise ValueError('Fixture fuera de la carpeta de pruebas')
    db.executescript((pathlib.Path(__file__).parent/'fixtures'/fixture).read_text())
# Benjamin Orellana - 24/10/2026 - Tabla financiera vacía para todas las suites de compras.
db.executescript((pathlib.Path(__file__).parent/'fixtures'/'agenda-compras.sqlite.sql').read_text())
print(json.dumps({'ready':True}), flush=True)
for line in sys.stdin:
    req = {}
    try:
        req = json.loads(line)
        if req.get('close'): break
        sql = adaptar(req['sql'])
        if re.match(r'^SET\b', sql, re.I):
            result = {'affectedRows':0}
        else:
            cur = db.execute(sql, req.get('params', []))
            if cur.description:
                result = []
                for row in cur.fetchall():
                    obj = dict(row)
                    for field, value in list(obj.items()):
                        key = field.split('.')[-1]
                        if value is not None and (key == 'id' or key.endswith('_id') or key in ('creado_por','subido_por','asignado_por','realizado_por','solicitado_por','otorgado_por')):
                            obj[field] = str(value)
                        elif key in ('detalle','datos_antes','datos_despues') and isinstance(value, str): obj[field] = json.loads(value)
                        elif key == 'tamanio_bytes' and value is not None: obj[field] = str(value)
                        elif key in ('precio','total','precio_unitario','importe','importe_reintegrado') and value is not None: obj[field] = format(value, '.2f')
                    result.append(obj)
            else:
                result = {'insertId':str(cur.lastrowid),'affectedRows':max(cur.rowcount,0)}
        print(json.dumps({'id':req['id'],'result':result}), flush=True)
    except Exception as error:
        message = str(error)
        errno, code = (1062,'ER_DUP_ENTRY') if 'UNIQUE constraint' in message else (1452,'ER_NO_REFERENCED_ROW_2') if 'FOREIGN KEY constraint' in message else (3819,'ER_CHECK_CONSTRAINT_VIOLATED') if 'CHECK constraint' in message else (0,'SQLITE_TEST_ERROR')
        print(json.dumps({'id':req.get('id'),'error':{'message':message,'errno':errno,'code':code}}), flush=True)
