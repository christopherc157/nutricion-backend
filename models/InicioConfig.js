const mongoose = require('mongoose');

const inicioConfigSchema = new mongoose.Schema({
  titulo: String,
  subtitulo: String,
  descripcion: String,
  imagen: String,
  galeriaHero: [{ type: String }]
});

module.exports = mongoose.model('InicioConfig', inicioConfigSchema);