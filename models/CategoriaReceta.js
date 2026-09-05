const mongoose = require('mongoose');

const categoriaRecetaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  orden: { type: Number, default: 0 }
});

module.exports = mongoose.model('CategoriaReceta', categoriaRecetaSchema);