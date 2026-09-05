require('dotenv').config();
const bcrypt = require('bcryptjs');
require('./db');
const Admin = require('./models/Admin');

async function crearAdmin() {
  const existe = await Admin.findOne({ email: 'christopherconstantino89@gmail.com' });

  if (existe) {
    console.log('Ese admin ya existe');
    process.exit();
  }

  const hash = bcrypt.hashSync('1234567', 10);

  await Admin.create({
    email: 'christopherconstantino89@gmail.com',
    password: hash,
    rol: 'admin'
  });

  console.log('Admin creado correctamente');
  process.exit();
}

crearAdmin();