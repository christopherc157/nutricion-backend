const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  categoriaId: { type: mongoose.Schema.Types.ObjectId, ref: 'CategoriaProducto', default: null },
  precio: { type: Number, required: true },
  stock: { type: Number, required: true, default: 0 },
  foto: { type: String },
  activo: { type: Boolean, default: true },
  destacado: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Producto', productoSchema);