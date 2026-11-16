-- Benjamin Orellana - 15/11/2026 - Admitir pagos reales y conservar el indicador de prueba.
-- Ejecutar como DBA tras respaldo; este ALTER hace commit implícito.
ALTER TABLE compra_pagos
  DROP CHECK ck_compra_pagos_prueba,
  ADD CONSTRAINT ck_compra_pagos_modo CHECK (modo_prueba IN (0, 1));
