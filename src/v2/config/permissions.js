export const PERMISSIONS = [
  { key: 'clientes.crear', module: 'clientes', action: 'crear', description: 'Crear clientes' },
  { key: 'clientes.modificar', module: 'clientes', action: 'modificar', description: 'Modificar clientes' },
  { key: 'medidores.crear', module: 'medidores', action: 'crear', description: 'Crear medidores' },
  { key: 'medidores.modificar', module: 'medidores', action: 'modificar', description: 'Modificar medidores' },
  { key: 'tarifas.crear', module: 'tarifas', action: 'crear', description: 'Crear tarifas y rangos' },
  { key: 'tarifas.modificar', module: 'tarifas', action: 'modificar', description: 'Modificar tarifas y rangos' },
  { key: 'rutas.crear', module: 'rutas', action: 'crear', description: 'Crear rutas' },
  { key: 'rutas.modificar', module: 'rutas', action: 'modificar', description: 'Modificar rutas' },
  { key: 'lecturas.tomar', module: 'lecturas', action: 'tomar', description: 'Registrar lecturas' },
  { key: 'lecturas.modificar', module: 'lecturas', action: 'modificar', description: 'Modificar lecturas' },
  { key: 'lecturas.recalcular', module: 'lecturas', action: 'recalcular', description: 'Recalcular vencimientos/lecturas' },
  { key: 'usuarios.gestionar_permisos', module: 'usuarios', action: 'gestionar_permisos', description: 'Gestionar permisos de usuarios' }
];

export const ROLE_DEFAULT_PERMISSIONS = {
  superadmin: PERMISSIONS.map((p) => p.key),
  administrador: PERMISSIONS.map((p) => p.key),
  operador: [
    'lecturas.tomar'
  ]
};
