# Factor E — Etapa 1: modelos y relaciones

Esta entrega prepara la capa de datos con la nomenclatura usada en PREMIUM:
`src/DataBase`, modelos `MD_TB_*`, carpetas por módulo y archivos `relaciones*.js`.
Usa Sequelize 6 y ES Modules. Todavía no incluye controladores, rutas ni servidor HTTP.

## Módulos

| Carpeta en src/Models | Tablas |
| --- | --- |
| Cliente | crm_clientes, clientes_notas |
| Usuario | usuarios, usuarios_sesiones, usuarios_tokens |
| Archivo | archivos, archivos_eliminaciones |
| Comercio | comercios_amigos, comercio_clientes |
| Curso | cursos, curso_modulos, curso_lecciones, curso_materiales |
| Acceso | curso_accesos, curso_acceso_lecciones, curso_accesos_historial |
| Campus | leccion_progreso |
| Sistema | auditoria_eventos |

## Instalación y verificación

Requiere Node 18.16 o superior y la base MySQL ya instalada.
Conservar el `.env` que se completó para `DB_FactoreDesa_04102026`.
Para una instalación nueva, copiar `.env.example` como `.env` y completar MySQL.

```bash
cd ~/Node_Factore_V1
npm ci
npm run modelos:verificar
npm run modelos:db
```

El primer comando de verificación carga 18 modelos, comprueba 185 columnas,
68 asociaciones y su inicialización sin duplicados. No conecta a MySQL.
El segundo contrasta tablas, tipos, valores predeterminados, índices, las 30
claves foráneas, los 15 CHECK efectivos y las 4 vistas contra la base configurada.
Solo consulta metadatos y fija UTC para la conexión; no crea ni modifica tablas o datos.

## Uso en las próximas etapas

Los controladores importarán cada modelo desde su carpeta. Al preparar el
arranque del servidor, se llamará una vez a `initRelaciones()` desde
`src/Models/relaciones.js`. Importar modelos no inicia conexiones ni un servidor.

Las fechas SQL usan `DATETIME(3)` en UTC. MySQL administra `creado_en` y
`actualizado_en`; no se agregan `createdAt` ni `updatedAt`. Los BIGINT y los
importes se mantienen como cadenas al leer para conservar precisión.

MySQL conserva las cinco claves foráneas compuestas que aseguran la pertenencia
al curso. Las asociaciones Sequelize usan los IDs únicos y no reemplazan esas
restricciones. No se utiliza sincronización automática del ORM.

Las consultas comunes de usuarios, sesiones y tokens omiten sus hashes. Para
autenticación se utilizará explícitamente `scope('conHash')`; los controladores
deberán seleccionar y serializar los datos que pueden enviar al cliente.
Los includes de relaciones tampoco sustituyen la autorización del alumno:
esa lógica y las consultas de las vistas del campus se prepararán en la siguiente etapa.

La dependencia uuid de Sequelize se fija mediante overrides en una versión
compatible con Node 18, conservada en package-lock.json.

Esta entrega reemplaza la organización del ZIP inicial. Sus comandos de
administrador, API y archivos se implementarán en las etapas de controladores
y rutas; primero se valida esta capa de datos.
