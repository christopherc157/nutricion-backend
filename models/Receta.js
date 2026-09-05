const mongoose = require('mongoose');

const recetaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  categoriaId: { type: mongoose.Schema.Types.ObjectId, ref: 'CategoriaReceta', default: null },
  ingredientes: [{ type: String }],
  pasos: [{ type: String }],
  foto: { type: String },
  tiempoPreparacion: { type: String },
  porciones: { type: String },
  sumaCalificaciones: { type: Number, default: 0 },
  cantidadCalificaciones: { type: Number, default: 0 },
  activo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Receta', recetaSchema);