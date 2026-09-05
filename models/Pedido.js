const mongoose = require('mongoose');

const pedidoSchema = new mongoose.Schema({
  nombreCliente: { type: String, required: true },
  telefono: { type: String, required: true },
  correo: { type: String, required: true },
  metodoEntrega: { type: String, required: true },
  direccionEnvio: { type: String },
  metodoPago: { type: String, required: true },
  total: { type: Number, required: true },
  entregado: { type: Boolean, default: false },
  items: [
    {
      productoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
      nombre: String,
      cantidad: Number,
      precioUnitario: Number
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pedido', pedidoSchema);