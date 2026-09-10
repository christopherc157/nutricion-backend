require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

require('./db'); // conecta a MongoDB
const Admin = require('./models/Admin');
const Disponibilidad = require('./models/Disponibilidad');
const Cita = require('./models/Cita');
const nodemailer = require('nodemailer');

const crypto = require('crypto');
const Verificacion = require('./models/Verificacion');

const Producto = require('./models/Producto');
const Pedido = require('./models/Pedido');
const InicioConfig = require('./models/InicioConfig');
const Paciente = require('./models/Paciente');
const Seguimiento = require('./models/Seguimiento');
const Receta = require('./models/Receta');
const CategoriaReceta = require('./models/CategoriaReceta');
const Recomendados = require('./models/Recomendados');
const CategoriaProducto = require('./models/CategoriaProducto');
const multer = require('multer');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const origenesPermitidos = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : true; // en desarrollo local, sin restricción

app.use(cors({ origin: origenesPermitidos }));
app.use(express.json());
// Limpiamos manualmente solo el body de cada petición (evita el error de
// compatibilidad de la librería con versiones nuevas de Express, que no
// permiten sobrescribir req.query directamente).
app.use((req, res, next) => {
  if (req.body) {
    req.body = mongoSanitize.sanitize(req.body);
  }
  next();
});

// Límite general: máximo 300 peticiones cada 15 min por IP, para toda la API
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: 'Demasiadas solicitudes, intenta de nuevo más tarde' }
});
app.use('/api/', limiteGeneral);

// Límite estricto: máximo 8 intentos de login cada 15 min por IP
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { message: 'Demasiados intentos de inicio de sesión. Espera unos minutos.' }
});

// Límite estricto: máximo 5 solicitudes de código de verificación cada 10 min por IP
const limiteVerificacion = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { message: 'Demasiadas solicitudes de código. Espera unos minutos e intenta de nuevo.' }
});

const SECRET_KEY = process.env.JWT_SECRET;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const cloudinary = require('./cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'nutricion-app/imagenes',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const storagePdf = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'nutricion-app/pdfs',
    resource_type: 'raw',
    allowed_formats: ['pdf']
  }
});

const uploadPdf = multer({
  storage: storagePdf,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF'));
    }
    cb(null, true);
  }
});

function formatearFechaVisual(fecha) {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

function formatearHora12(hora) {
  const [h, m] = hora.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${periodo}`;
}

function formatearFechaHoraPedido(fechaISO) {
  const fecha = new Date(fechaISO);

  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const anio = fecha.getFullYear();

  const horas = fecha.getHours();
  const minutos = fecha.getMinutes().toString().padStart(2, '0');
  const periodo = horas >= 12 ? 'PM' : 'AM';
  let horas12 = horas % 12;
  if (horas12 === 0) horas12 = 12;

  return `${dia}-${mes}-${anio} a las ${horas12}:${minutos} ${periodo}`;
}

async function enviarCorreoVerificacion(email, codigo, proposito) {
  const asuntoTexto = proposito === 'cita' ? 'tu cita' : 'tu pedido';

  await transporter.sendMail({
    from: `"LN Brenda Lagunas" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Tu código de verificación: ${codigo}`,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'assets/logo.png'),
        cid: 'logoConsultorio'
      }
    ],
    html: `
    <div style="background:#f9fbf9; padding:30px 15px; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08); text-align:center;">
        <tr>
          <td style="background:#d81b60; padding:26px;">
            <img src="cid:logoConsultorio" alt="LN Brenda Lagunas" width="150" style="display:block; margin:0 auto 12px; max-width:100%; height:auto; border-radius:12px; background:#ffffff; padding:8px;" />
            <p style="color:#ffffff; font-size:16px; font-weight:bold; margin:0;">Verifica tu identidad</p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px;">
            <p style="font-size:14px; color:#6c757d; margin:0 0 20px;">Usa este código para confirmar ${asuntoTexto}:</p>
            <p style="font-size:36px; font-weight:bold; letter-spacing:8px; color:#2c3e50; margin:0 0 20px;">${codigo}</p>
            <p style="font-size:12px; color:#6c757d; margin:0;">Este código vence en 10 minutos. Si tú no solicitaste esto, puedes ignorar este correo.</p>
          </td>
        </tr>
      </table>
    </div>
    `
  });
}

const NOMBRE_CONSULTORIO = 'Consultorio LN Brenda Lagunas';
const DIRECCION_CONSULTORIO = 'Calle Acapulco 11A, Colonia Morelos, Uruapan, Michoacán, CP 60050';

async function enviarCorreoNuevaCita(cita) {
  await transporter.sendMail({
    from: `"LN Brenda Lagunas" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: `📅 Nueva cita: ${cita.nombre} - ${formatearFechaVisual(cita.fecha)}`,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'assets/logo.png'),
        cid: 'logoConsultorio'
      }
    ],
    html: `
    <div style="background:#f9fbf9; padding:30px 15px; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg, #d81b60, #2e7d32); background-color:#d81b60; padding:28px; text-align:center;">
            <img src="cid:logoConsultorio" alt="LN Brenda Lagunas" width="150" style="display:block; margin:0 auto 12px; max-width:100%; height:auto; border-radius:12px; background:#ffffff; padding:8px;" />
            <p style="color:#ffffff; font-size:18px; font-weight:bold; margin:0;">Nueva cita agendada</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:28px;">
            <p style="font-size:14px; color:#6c757d; margin:0 0 20px;">Tienes una nueva cita agendada en tu consultorio. Estos son los detalles:</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#6c757d;">Nombre</td>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${cita.nombre}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#6c757d;">Teléfono</td>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${cita.telefono}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#6c757d;">Tipo de consulta</td>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${cita.tipoConsulta}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#6c757d;">Fecha</td>
                <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${formatearFechaVisual(cita.fecha)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; font-size:14px; color:#6c757d;">Hora</td>
                <td style="padding:10px 0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${formatearHora12(cita.hora)}</td>
              </tr>
            </table>

            ${cita.motivo ? `
            <div style="background:#fce4ec; border-radius:12px; padding:14px 16px; margin-top:20px;">
              <p style="margin:0 0 4px; font-size:12px; color:#d81b60; font-weight:bold; text-transform:uppercase;">Motivo principal</p>
              <p style="margin:0; font-size:14px; color:#2c3e50; font-style:italic;">${cita.motivo}</p>
            </div>
            ` : ''}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fbf9; padding:18px; text-align:center;">
            <p style="margin:0; font-size:12px; color:#6c757d;">LN Brenda Lagunas · Nutrición Integral y Salud Hormonal</p>
          </td>
        </tr>

      </table>
    </div>
    `
  });
}

async function enviarCorreoConfirmacionCitaCliente(cita) {
  await transporter.sendMail({
    from: `"LN Brenda Lagunas" <${process.env.EMAIL_USER}>`,
    to: cita.correo,
    subject: `✅ Tu cita fue agendada - ${formatearFechaVisual(cita.fecha)}`,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'assets/logo.png'),
        cid: 'logoConsultorio'
      }
    ],
    html: `
    <div style="background:#f9fbf9; padding:30px 15px; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:#d81b60; padding:28px; text-align:center;">
            <img src="cid:logoConsultorio" alt="LN Brenda Lagunas" width="150" style="display:block; margin:0 auto 12px; max-width:100%; height:auto; border-radius:12px; background:#ffffff; padding:8px;" />
            <p style="color:#ffffff; font-size:20px; font-weight:bold; margin:0;">¡Tu cita fue agendada!</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:28px;">
            <p style="font-size:14px; color:#6c757d; margin:0 0 22px;">Hola ${cita.nombre}, te esperamos en tu cita. Estos son los detalles:</p>

            <div style="background:#fce4ec; border-radius:12px; padding:20px; text-align:center; margin-bottom:22px;">
              <p style="margin:0 0 4px; font-size:12px; color:#d81b60; font-weight:bold; text-transform:uppercase; letter-spacing:.5px;">Fecha y hora</p>
              <p style="margin:0; font-size:22px; color:#2c3e50; font-weight:bold;">${formatearFechaVisual(cita.fecha)}</p>
              <p style="margin:4px 0 0; font-size:18px; color:#2e7d32; font-weight:bold;">${formatearHora12(cita.hora)}</p>
            </div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
              <tr>
                <td style="padding:8px 0; font-size:14px; color:#6c757d;">Tipo de consulta</td>
                <td style="padding:8px 0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${cita.tipoConsulta}</td>
              </tr>
            </table>

            <div style="border-top:1px dashed #e0e0e0; padding-top:18px; margin-bottom:18px;">
              <p style="margin:0 0 4px; font-size:12px; color:#6c757d; font-weight:bold; text-transform:uppercase;">Dónde encontrarnos</p>
              <p style="margin:0; font-size:14px; color:#2c3e50; font-weight:bold;">${NOMBRE_CONSULTORIO}</p>
              <p style="margin:2px 0 0; font-size:13px; color:#6c757d;">${DIRECCION_CONSULTORIO}</p>
            </div>

            <div style="background:#e8f5e9; border-radius:12px; padding:14px 16px;">
              <p style="margin:0; font-size:13px; color:#2e7d32;">
                <strong>¿Alguna duda?</strong> Escríbenos al ${process.env.TELEFONO_CONTACTO || process.env.WHATSAPP_NUMERO}
              </p>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fbf9; padding:18px; text-align:center;">
            <p style="margin:0; font-size:12px; color:#6c757d;">LN Brenda Lagunas · Nutrición Integral y Salud Hormonal</p>
          </td>
        </tr>

      </table>
    </div>
    `
  });
}

async function enviarCorreoNuevoPedido(pedido) {
  const filasProductos = pedido.items
    .map(i => `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50;">${i.nombre}</td>
        <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#6c757d; text-align:center;">x${i.cantidad}</td>
        <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">$${i.precioUnitario * i.cantidad}</td>
      </tr>
    `)
    .join('');

  const lineaDireccion = pedido.direccionEnvio
    ? `
      <div style="background:#fce4ec; border-radius:12px; padding:14px 16px; margin-top:18px;">
        <p style="margin:0 0 4px; font-size:12px; color:#d81b60; font-weight:bold; text-transform:uppercase;">Dirección de envío</p>
        <p style="margin:0; font-size:14px; color:#2c3e50;">${pedido.direccionEnvio}</p>
      </div>
    `
    : `
      <div style="background:#e8f5e9; border-radius:12px; padding:14px 16px; margin-top:18px;">
        <p style="margin:0; font-size:14px; color:#2e7d32;"><strong>El cliente pasará a recoger en el consultorio.</strong></p>
      </div>
    `;

  await transporter.sendMail({
    from: `"LN Brenda Lagunas" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: `🛍️ Nuevo pedido: ${pedido.nombreCliente} - $${pedido.total} MXN`,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'assets/logo.png'),
        cid: 'logoConsultorio'
      }
    ],
    html: `
    <div style="background:#f9fbf9; padding:30px 15px; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:#2e7d32; padding:28px; text-align:center;">
            <img src="cid:logoConsultorio" alt="LN Brenda Lagunas" width="150" style="display:block; margin:0 auto 12px; max-width:100%; height:auto; border-radius:12px; background:#ffffff; padding:8px;" />
            <p style="color:#ffffff; font-size:18px; font-weight:bold; margin:0;">Nuevo pedido recibido</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                  <td style="padding:6px 0; font-size:14px; color:#6c757d;">Fecha</td>
                  <td style="padding:6px 0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${formatearFechaHoraPedido(pedido.createdAt)}</td>
                </tr>
              <tr>
                <td style="padding:6px 0; font-size:14px; color:#6c757d;">Cliente</td>
                <td style="padding:6px 0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${pedido.nombreCliente}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; font-size:14px; color:#6c757d;">Teléfono</td>
                <td style="padding:6px 0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${pedido.telefono}</td>
              </tr>
              <tr>
                <td style="padding:6px 0; font-size:14px; color:#6c757d;">Método de pago</td>
                <td style="padding:6px 0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">${pedido.metodoPago}</td>
              </tr>
            </table>

            <p style="margin:0 0 10px; font-size:12px; color:#6c757d; font-weight:bold; text-transform:uppercase;">Productos</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${filasProductos}
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
              <tr>
                <td style="font-size:16px; color:#2c3e50; font-weight:bold;">Total</td>
                <td style="font-size:20px; color:#2e7d32; font-weight:bold; text-align:right;">$${pedido.total} MXN</td>
              </tr>
            </table>

            ${lineaDireccion}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fbf9; padding:18px; text-align:center;">
            <p style="margin:0; font-size:12px; color:#6c757d;">LN Brenda Lagunas · Tienda de suplementos</p>
          </td>
        </tr>

      </table>
    </div>
    `
  });
}

async function enviarCorreoConfirmacionPedidoCliente(pedido) {
  const filasProductos = pedido.items
    .map(i => `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50;">${i.nombre}</td>
        <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#6c757d; text-align:center;">x${i.cantidad}</td>
        <td style="padding:10px 0; border-bottom:1px solid #e0e0e0; font-size:14px; color:#2c3e50; font-weight:bold; text-align:right;">$${i.precioUnitario * i.cantidad}</td>
      </tr>
    `)
    .join('');

  const bloqueEntrega = pedido.direccionEnvio
    ? `
      <div style="border-top:1px dashed #e0e0e0; padding-top:18px; margin-bottom:18px;">
        <p style="margin:0 0 4px; font-size:12px; color:#6c757d; font-weight:bold; text-transform:uppercase;">Se enviará a</p>
        <p style="margin:0; font-size:14px; color:#2c3e50;">${pedido.direccionEnvio}</p>
      </div>
    `
    : `
      <div style="border-top:1px dashed #e0e0e0; padding-top:18px; margin-bottom:18px;">
        <p style="margin:0 0 4px; font-size:12px; color:#6c757d; font-weight:bold; text-transform:uppercase;">Recoges en</p>
        <p style="margin:0; font-size:14px; color:#2c3e50; font-weight:bold;">${NOMBRE_CONSULTORIO}</p>
        <p style="margin:2px 0 0; font-size:13px; color:#6c757d;">${DIRECCION_CONSULTORIO}</p>
      </div>
    `;

  const notaPago = pedido.metodoPago === 'Transferencia'
    ? 'Recuerda enviarnos tu comprobante de transferencia por WhatsApp para confirmar tu pedido.'
    : 'Recuerda que el pago es en efectivo al momento de recibir tus productos.';

  await transporter.sendMail({
    from: `"LN Brenda Lagunas" <${process.env.EMAIL_USER}>`,
    to: pedido.correo,
    subject: `✅ Tu pedido fue confirmado - $${pedido.total} MXN`,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'assets/logo.png'),
        cid: 'logoConsultorio'
      }
    ],
    html: `
    <div style="background:#f9fbf9; padding:30px 15px; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:#2e7d32; padding:28px; text-align:center;">
            <img src="cid:logoConsultorio" alt="LN Brenda Lagunas" width="150" style="display:block; margin:0 auto 12px; max-width:100%; height:auto; border-radius:12px; background:#ffffff; padding:8px;" />
            <p style="color:#ffffff; font-size:20px; font-weight:bold; margin:0;">¡Tu pedido fue confirmado!</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:28px;">
            <p style="font-size:14px; color:#6c757d; margin:0 0 20px;">Hola ${pedido.nombreCliente}, gracias por tu compra. Este es tu resumen:</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${filasProductos}
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px; margin-bottom:18px;">
              <tr>
                <td style="font-size:16px; color:#2c3e50; font-weight:bold;">Total</td>
                <td style="font-size:20px; color:#2e7d32; font-weight:bold; text-align:right;">$${pedido.total} MXN</td>
              </tr>
            </table>

            ${bloqueEntrega}

            <div style="background:#fce4ec; border-radius:12px; padding:14px 16px; margin-bottom:16px;">
              <p style="margin:0; font-size:13px; color:#d81b60;">${notaPago}</p>
              <p style="margin:0; font-size:13px; color:#d81b60;">Nos pondremos en contacto contigo para coordinar los detalles.</p>
            </div>

            <div style="background:#e8f5e9; border-radius:12px; padding:14px 16px;">
              <p style="margin:0; font-size:13px; color:#2e7d32;">
                <strong>¿Alguna duda?</strong> Escríbenos al ${process.env.TELEFONO_CONTACTO || process.env.WHATSAPP_NUMERO}
              </p>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fbf9; padding:18px; text-align:center;">
            <p style="margin:0; font-size:12px; color:#6c757d;">LN Brenda Lagunas · Tienda de suplementos</p>
          </td>
        </tr>

      </table>
    </div>
    `
  });
}

/* ================= AUTH MIDDLEWARE ================= */

function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(403).json({ message: 'Token requerido' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

/* ================= LOGIN ================= */

app.post('/api/login', limiteLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await Admin.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Datos incorrectos' });
    }

    const passwordValida = bcrypt.compareSync(password, user.password);

    if (!passwordValida) {
      return res.status(401).json({ message: 'Datos incorrectos' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, rol: user.rol },
      SECRET_KEY,
      { expiresIn: '30m' }
    );

    res.json({
      message: 'Login correcto',
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.rol
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

/* ================= DISPONIBILIDAD ================= */

// Público: lista de fechas que tienen al menos una hora disponible
// (para pintar el calendario con los días habilitados)
app.get('/api/disponibilidad', async (req, res) => {
  try {
    const dias = await Disponibilidad.find({
      horas: { $elemMatch: { disponible: true } }
    }).select('fecha -_id');

    res.json(dias.map(d => d.fecha));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener disponibilidad' });
  }
});

// Público: horas disponibles de un día específico
// Público: horas de un día específico (ya considerando reservas temporales activas)
app.get('/api/disponibilidad/:fecha', async (req, res) => {
  try {
    const dia = await Disponibilidad.findOne({ fecha: req.params.fecha });

    if (!dia) {
      return res.json([]);
    }

    const ahora = new Date();

    const horasConEstadoReal = dia.horas.map(h => {
      const enHold = h.reservadoHasta && h.reservadoHasta > ahora;
      return {
        hora: h.hora,
        disponible: h.disponible && !enHold
      };
    });

    res.json(horasConEstadoReal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el día' });
  }
});

// Público: reservar temporalmente una hora mientras el cliente completa el formulario
app.post('/api/disponibilidad/:fecha/reservar', async (req, res) => {
  try {
    const { hora } = req.body;

    if (!hora) {
      return res.status(400).json({ message: 'Falta la hora' });
    }

    const dia = await Disponibilidad.findOne({ fecha: req.params.fecha });

    if (!dia) {
      return res.status(404).json({ message: 'Ese día no tiene horarios disponibles' });
    }

    const horaObj = dia.horas.find(h => h.hora === hora);
    const ahora = new Date();

    if (!horaObj || !horaObj.disponible) {
      return res.status(409).json({ message: 'Esa hora ya no está disponible' });
    }

    if (horaObj.reservadoHasta && horaObj.reservadoHasta > ahora) {
      return res.status(409).json({ message: 'Alguien más está reservando esa hora en este momento' });
    }

    const MINUTOS_HOLD = 5;
    horaObj.reservadoHasta = new Date(ahora.getTime() + MINUTOS_HOLD * 60 * 1000);
    await dia.save();

    res.json({ ok: true, segundosRestantes: MINUTOS_HOLD * 60 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al reservar el horario' });
  }
});

// Público: liberar una hora reservada (si el cliente cancela o cambia de horario)
app.post('/api/disponibilidad/:fecha/liberar', async (req, res) => {
  try {
    const { hora } = req.body;

    const dia = await Disponibilidad.findOne({ fecha: req.params.fecha });
    if (!dia) return res.json({ ok: true });

    const horaObj = dia.horas.find(h => h.hora === hora);
    if (horaObj) {
      horaObj.reservadoHasta = null;
      await dia.save();
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al liberar el horario' });
  }
});

// Admin: crear o reemplazar las horas habilitadas de un día
app.post('/api/disponibilidad', verificarToken, async (req, res) => {
  try {
    const { fecha, horas } = req.body;

    if (!fecha || !Array.isArray(horas)) {
      return res.status(400).json({ message: 'Fecha y horas son obligatorias' });
    }

    const dia = await Disponibilidad.findOneAndUpdate(
      { fecha },
      { fecha, horas },
      { upsert: true, new: true }
    );

    res.json(dia);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al guardar disponibilidad' });
  }
});

// Admin: eliminar un día completo (por si te equivocaste al habilitarlo)
app.delete('/api/disponibilidad/:fecha', verificarToken, async (req, res) => {
  try {
    await Disponibilidad.deleteOne({ fecha: req.params.fecha });
    res.json({ message: 'Día eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar' });
  }
});

/* ================= VERIFICACIÓN ================= */

// Público: solicitar un código de verificación
app.post('/api/verificacion/enviar', limiteVerificacion, async (req, res) => {
  try {
    const { email, proposito } = req.body;

    if (typeof email !== 'string' || typeof proposito !== 'string') {
      return res.status(400).json({ message: 'Datos inválidos' });
    }

    if (!email.trim() || !['cita', 'pedido'].includes(proposito)) {
      return res.status(400).json({ message: 'Faltan datos' });
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    await Verificacion.create({
      email: email.toLowerCase().trim(),
      proposito,
      codigo
    });

    await enviarCorreoVerificacion(email, codigo, proposito);

    res.json({ message: 'Código enviado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al enviar el código' });
  }
});

// Público: confirmar el código ingresado
app.post('/api/verificacion/confirmar', async (req, res) => {
  try {
    const { email, proposito, codigo } = req.body;

    if (typeof email !== 'string' || typeof proposito !== 'string' || typeof codigo !== 'string') {
      return res.status(400).json({ message: 'Datos inválidos' });
    }

    if (!email.trim() || !['cita', 'pedido'].includes(proposito) || !codigo.trim()) {
      return res.status(400).json({ message: 'Faltan datos' });
    }

    const emailNormalizado = email.toLowerCase().trim();

    const verificacion = await Verificacion.findOne({
      email: emailNormalizado,
      proposito,
      verificado: false
    }).sort({ createdAt: -1 });

    if (!verificacion) {
      return res.status(400).json({ message: 'No hay un código pendiente para este correo. Solicita uno nuevo.' });
    }

    if (verificacion.intentos >= 5) {
      return res.status(429).json({ message: 'Demasiados intentos. Solicita un código nuevo.' });
    }

    if (verificacion.codigo !== codigo) {
      verificacion.intentos += 1;
      await verificacion.save();
      return res.status(400).json({ message: 'Código incorrecto' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    verificacion.verificado = true;
    verificacion.token = token;
    await verificacion.save();

    res.json({ verificado: true, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al verificar el código' });
  }
});

// Función auxiliar: valida que un token de verificación sea real y no se haya usado antes
async function validarTokenVerificacion(email, proposito, token) {
  if (!email || !token) return false;

  const verificacion = await Verificacion.findOne({
    email: email.toLowerCase().trim(),
    proposito,
    token,
    verificado: true,
    usado: false
  });

  if (!verificacion) return false;

  verificacion.usado = true;
  await verificacion.save();
  return true;
}

/* ================= CITAS ================= */

// Público: agendar una cita nueva
app.post('/api/citas', async (req, res) => {
  try {
    const { nombre, telefono, correo, tipoConsulta, motivo, fecha, hora, verificacionToken } = req.body;

    if (!nombre || !telefono || !correo || !tipoConsulta || !fecha || !hora || !verificacionToken) {
      return res.status(400).json({ message: 'Faltan datos obligatorios' });
    }

    const tokenValido = await validarTokenVerificacion(correo, 'cita', verificacionToken);

    if (!tokenValido) {
      return res.status(403).json({ message: 'Verificación inválida o expirada. Solicita un nuevo código.' });
    }

    const dia = await Disponibilidad.findOne({ fecha });

    if (!dia) {
      return res.status(400).json({ message: 'Ese día no tiene horarios disponibles' });
    }

    const horaObj = dia.horas.find(h => h.hora === hora);
    const ahora = new Date();

    if (!horaObj || !horaObj.disponible) {
      return res.status(409).json({ message: 'Esa hora ya no está disponible, elige otra' });
    }

    if (!horaObj.reservadoHasta || horaObj.reservadoHasta < ahora) {
      return res.status(410).json({ message: 'Tu tiempo para completar la reserva expiró. Elige el horario nuevamente.' });
    }

    // Confirmamos la cita: se ocupa para siempre y se libera el hold temporal
    horaObj.disponible = false;
    horaObj.reservadoHasta = null;
    await dia.save();

    const nuevaCita = await Cita.create({
      nombre, telefono, correo, tipoConsulta, motivo, fecha, hora
    });

    // El correo se manda sin bloquear la respuesta al cliente
    enviarCorreoNuevaCita(nuevaCita).catch(err =>
      console.error('Error enviando correo:', err)
    );

    enviarCorreoConfirmacionCitaCliente(nuevaCita).catch(err =>
      console.error('Error enviando correo (cliente):', err)
    );

    const mensajeWhatsapp = encodeURIComponent(
      `Hola, acabo de agendar una cita:\nNombre: ${nombre}\nTeléfono: ${telefono}\nTipo de consulta: ${tipoConsulta}\nFecha: ${fecha}\nHora: ${hora}`
    );

    res.status(201).json({
      message: 'Cita agendada correctamente',
      cita: nuevaCita,
      whatsappUrl: `https://wa.me/${process.env.WHATSAPP_NUMERO}?text=${mensajeWhatsapp}`
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al agendar la cita' });
  }
});

// Admin: ver todas las citas agendadas
app.get('/api/citas', verificarToken, async (req, res) => {
  try {
    const citas = await Cita.find().sort({ fecha: 1, hora: 1 });
    res.json(citas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener citas' });
  }
});

// Admin: cancelar una cita (libera la hora de nuevo)
app.delete('/api/citas/:id', verificarToken, async (req, res) => {
  try {
    const cita = await Cita.findByIdAndDelete(req.params.id);

    if (cita) {
      const dia = await Disponibilidad.findOne({ fecha: cita.fecha });
      if (dia) {
        const horaObj = dia.horas.find(h => h.hora === cita.hora);
        if (horaObj) {
          horaObj.disponible = true;
          await dia.save();
        }
      }
    }

    res.json({ message: 'Cita eliminada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar cita' });
  }
});

// Admin: marcar/desmarcar una cita como atendida
app.patch('/api/citas/:id/atendida', verificarToken, async (req, res) => {
  try {
    const { atendida } = req.body;

    const cita = await Cita.findByIdAndUpdate(
      req.params.id,
      { atendida },
      { new: true }
    );

    if (!cita) {
      return res.status(404).json({ message: 'Cita no encontrada' });
    }

    res.json(cita);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar la cita' });
  }
});

/* ================= CATEGORÍAS DE PRODUCTOS ================= */

// Público: listado de categorías (para el filtro de la tienda)
app.get('/api/categorias-productos', async (req, res) => {
  try {
    const categorias = await CategoriaProducto.find().sort({ orden: 1, nombre: 1 });
    res.json(categorias);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
});

// Admin: crear categoría
app.post('/api/categorias-productos', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    const existe = await CategoriaProducto.findOne({ nombre: nombre.trim() });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    }

    const nueva = await CategoriaProducto.create({ nombre: nombre.trim() });
    res.status(201).json(nueva);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear la categoría' });
  }
});

// Admin: editar categoría
app.put('/api/categorias-productos/:id', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;

    const categoria = await CategoriaProducto.findByIdAndUpdate(
      req.params.id,
      { nombre: nombre.trim() },
      { new: true }
    );

    res.json(categoria);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al editar la categoría' });
  }
});

// Admin: eliminar categoría (los productos que la usaban quedan "Sin categoría")
app.delete('/api/categorias-productos/:id', verificarToken, async (req, res) => {
  try {
    await CategoriaProducto.findByIdAndDelete(req.params.id);
    await Producto.updateMany({ categoriaId: req.params.id }, { categoriaId: null });
    res.json({ message: 'Categoría eliminada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar la categoría' });
  }
});

/* ================= PRODUCTOS ================= */

// Público: solo productos activos (con stock o no, el frontend decide si mostrarlo agotado)
app.get('/api/productos', async (req, res) => {
  try {
    const productos = await Producto.find({ activo: true }).populate('categoriaId').sort({ createdAt: -1 });
    res.json(productos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// Admin: todos los productos, activos e inactivos
app.get('/api/productos/todos', verificarToken, async (req, res) => {
  try {
    const productos = await Producto.find().populate('categoriaId').sort({ createdAt: -1 });
    res.json(productos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// Admin: crear producto (con foto)
app.post('/api/productos', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    const { nombre, descripcion, categoriaId, precio, stock, destacado } = req.body;

    if (!nombre || !precio) {
      return res.status(400).json({ message: 'Nombre y precio son obligatorios' });
    }

    const foto = req.file ? req.file.path : null;

    const nuevoProducto = await Producto.create({
      nombre,
      descripcion,
      categoriaId: categoriaId || null,
      precio: Number(precio),
      stock: Number(stock) || 0,
      destacado: destacado === 'true' || destacado === true,
      foto
    });

    const productoConCategoria = await nuevoProducto.populate('categoriaId');
    res.status(201).json(productoConCategoria);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto' });
  }
});

// Admin: editar producto (la foto es opcional — si no mandas una nueva, se queda la que ya tenía)
app.put('/api/productos/:id', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    const { nombre, descripcion, categoriaId, precio, stock, activo, destacado } = req.body;

    const datosActualizados = {
      nombre,
      descripcion,
      categoriaId: categoriaId || null,
      precio: Number(precio),
      stock: Number(stock),
      activo: activo === 'true' || activo === true,
      destacado: destacado === 'true' || destacado === true
    };

    if (req.file) {
      datosActualizados.foto = req.file.path;
    }

    const producto = await Producto.findByIdAndUpdate(
      req.params.id,
      datosActualizados,
      { new: true }
    ).populate('categoriaId');

    res.json(producto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al editar producto' });
  }
});

// Admin: eliminar producto
app.delete('/api/productos/:id', verificarToken, async (req, res) => {
  try {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ message: 'Producto eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
});

/* ================= PEDIDOS ================= */

// Público: crear un pedido desde el carrito
app.post('/api/pedidos', async (req, res) => {
  try {
    const { nombreCliente, telefono, correo, metodoEntrega, direccionEnvio, metodoPago, items, verificacionToken } = req.body;

    if (!nombreCliente || !telefono || !correo || !metodoEntrega || !metodoPago || !verificacionToken) {
      return res.status(400).json({ message: 'Faltan datos obligatorios' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'El carrito está vacío' });
    }

    const tokenValido = await validarTokenVerificacion(correo, 'pedido', verificacionToken);

    if (!tokenValido) {
      return res.status(403).json({ message: 'Verificación inválida o expirada. Solicita un nuevo código.' });
    }

    const itemsConfirmados = [];
    let total = 0;

    for (const item of items) {
      const producto = await Producto.findById(item.productoId);

      if (!producto || !producto.activo) {
        return res.status(400).json({ message: `Producto no disponible: ${item.productoId}` });
      }

      if (producto.stock < item.cantidad) {
        return res.status(409).json({
          message: `No hay suficiente stock de "${producto.nombre}". Disponible: ${producto.stock}`
        });
      }

      itemsConfirmados.push({
        productoId: producto._id,
        nombre: producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: producto.precio
      });

      total += producto.precio * item.cantidad;
    }

    for (const item of itemsConfirmados) {
      await Producto.findByIdAndUpdate(item.productoId, {
        $inc: { stock: -item.cantidad }
      });
    }

    const nuevoPedido = await Pedido.create({
      nombreCliente,
      telefono,
      correo,
      metodoEntrega,
      direccionEnvio: metodoEntrega === 'Envío a domicilio' ? direccionEnvio : undefined,
      metodoPago,
      total,
      items: itemsConfirmados
    });

    enviarCorreoNuevoPedido(nuevoPedido).catch(err =>
      console.error('Error enviando correo (admin):', err)
    );

    enviarCorreoConfirmacionPedidoCliente(nuevoPedido).catch(err =>
      console.error('Error enviando correo (cliente):', err)
    );

    const resumenItems = itemsConfirmados
      .map(i => `- ${i.nombre} x${i.cantidad} ($${i.precioUnitario} c/u)`)
      .join('\n');

    const lineaDireccion = metodoEntrega === 'Envío a domicilio' && direccionEnvio
      ? `\nDirección: ${direccionEnvio}`
      : '';

    const mensajeWhatsapp = encodeURIComponent(
      `Hola, acabo de hacer un pedido:\n${resumenItems}\n\nTotal: $${total}\nEntrega: ${metodoEntrega}${lineaDireccion}\nPago: ${metodoPago}\nNombre: ${nombreCliente}\nTeléfono: ${telefono}`
    );

    res.status(201).json({
      message: 'Pedido creado correctamente',
      pedido: nuevoPedido,
      whatsappUrl: `https://wa.me/${process.env.WHATSAPP_NUMERO}?text=${mensajeWhatsapp}`
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear el pedido' });
  }
});

// Admin: ver todos los pedidos
app.get('/api/pedidos', verificarToken, async (req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener pedidos' });
  }
});

// Admin: marcar/desmarcar un pedido como entregado
app.patch('/api/pedidos/:id/entregado', verificarToken, async (req, res) => {
  try {
    const { entregado } = req.body;

    const pedido = await Pedido.findByIdAndUpdate(
      req.params.id,
      { entregado },
      { new: true }
    );

    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    res.json(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar el pedido' });
  }
});

/* ================= INICIO (CONFIG) ================= */

// Público: traer la config para mostrarla en la página de bienvenida
app.get('/api/inicio', async (req, res) => {
  try {
    const config = await InicioConfig.findOne();
    res.json(config || {});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener la configuración de inicio' });
  }
});

// Admin: editar la config (con imagen opcional)
app.put('/api/inicio', verificarToken, upload.single('imagen'), async (req, res) => {
  try {
    const { titulo, subtitulo, descripcion } = req.body;

    const datosActualizados = { titulo, subtitulo, descripcion };

    if (req.file) {
      datosActualizados.imagen = req.file.path;
    }

    let config = await InicioConfig.findOne();

    if (config) {
      config = await InicioConfig.findByIdAndUpdate(config._id, datosActualizados, { new: true });
    } else {
      config = await InicioConfig.create(datosActualizados);
    }

    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar la configuración de inicio' });
  }
});

// Admin: agregar una o varias imágenes a la galería del hero
app.post('/api/inicio/galeria', verificarToken, upload.array('imagenes', 8), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }

    const nuevasUrls = req.files.map(f => f.path);

    let config = await InicioConfig.findOne();

    if (config) {
      config.galeriaHero = [...(config.galeriaHero || []), ...nuevasUrls];
      await config.save();
    } else {
      config = await InicioConfig.create({ galeriaHero: nuevasUrls });
    }

    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al subir las imágenes' });
  }
});

// Admin: quitar una imagen puntual de la galería
app.delete('/api/inicio/galeria', verificarToken, async (req, res) => {
  try {
    const { url } = req.body;

    const config = await InicioConfig.findOne();
    if (!config) return res.json({ message: 'ok' });

    config.galeriaHero = (config.galeriaHero || []).filter(img => img !== url);
    await config.save();

    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar la imagen' });
  }
});

/* ================= PACIENTES ================= */

// Admin: ver todos los pacientes
app.get('/api/pacientes', verificarToken, async (req, res) => {
  try {
    const pacientes = await Paciente.find({ activo: true }).sort({ nombre: 1 });
    res.json(pacientes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener pacientes' });
  }
});

// Admin: sugerencias de pacientes a partir de citas ya agendadas que todavía no están registradas como paciente
app.get('/api/pacientes/sugeridos', verificarToken, async (req, res) => {
  try {
    const correosExistentes = (await Paciente.find().select('correo')).map(p => p.correo);

    const citas = await Cita.find(
      correosExistentes.length ? { correo: { $nin: correosExistentes } } : {}
    ).sort({ createdAt: -1 });

    // Nos quedamos con una sola sugerencia por correo (la cita más reciente de cada persona)
    const vistos = new Set();
    const sugerencias = [];

    for (const cita of citas) {
      if (vistos.has(cita.correo)) continue;
      vistos.add(cita.correo);
      sugerencias.push({
        nombre: cita.nombre,
        correo: cita.correo,
        telefono: cita.telefono,
        fechaPrimeraConsulta: cita.fecha
      });
    }

    res.json(sugerencias);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener sugerencias' });
  }
});

// Admin: crear paciente (manual o a partir de una sugerencia)
app.post('/api/pacientes', verificarToken, async (req, res) => {
  try {
    const { nombre, correo, telefono, fechaPrimeraConsulta, objetivo, notasGenerales } = req.body;

    if (!nombre || !correo || !telefono) {
      return res.status(400).json({ message: 'Nombre, correo y teléfono son obligatorios' });
    }

    const existe = await Paciente.findOne({ correo: correo.toLowerCase().trim() });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe un paciente registrado con ese correo' });
    }

    const nuevoPaciente = await Paciente.create({
      nombre,
      correo: correo.toLowerCase().trim(),
      telefono,
      fechaPrimeraConsulta,
      objetivo,
      notasGenerales
    });

    res.status(201).json(nuevoPaciente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear paciente' });
  }
});

// Admin: editar datos generales del paciente
app.put('/api/pacientes/:id', verificarToken, async (req, res) => {
  try {
    const { nombre, telefono, objetivo, notasGenerales, activo } = req.body;

    const paciente = await Paciente.findByIdAndUpdate(
      req.params.id,
      { nombre, telefono, objetivo, notasGenerales, activo },
      { new: true }
    );

    res.json(paciente);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al editar paciente' });
  }
});

// Admin: eliminar paciente (y todo su historial de seguimiento)
app.delete('/api/pacientes/:id', verificarToken, async (req, res) => {
  try {
    await Paciente.findByIdAndDelete(req.params.id);
    await Seguimiento.deleteMany({ pacienteId: req.params.id });
    res.json({ message: 'Paciente eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar paciente' });
  }
});

/* ================= SEGUIMIENTO ================= */

// Admin: historial de seguimiento de un paciente
app.get('/api/pacientes/:id/seguimientos', verificarToken, async (req, res) => {
  try {
    const seguimientos = await Seguimiento.find({ pacienteId: req.params.id }).sort({ fecha: 1 });
    res.json(seguimientos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener el historial' });
  }
});

// Admin: agregar un nuevo registro de seguimiento
app.post('/api/pacientes/:id/seguimientos', verificarToken, async (req, res) => {
  try {
    const { fecha, peso, estatura, grasaCorporal, cintura, cadera, observaciones, proximoObjetivo } = req.body;

    if (!fecha || !peso) {
      return res.status(400).json({ message: 'La fecha y el peso son obligatorios' });
    }

    let imc;
    if (estatura) {
      const estaturaMetros = estatura / 100;
      imc = Number((peso / (estaturaMetros * estaturaMetros)).toFixed(1));
    }

    const nuevoSeguimiento = await Seguimiento.create({
      pacienteId: req.params.id,
      fecha,
      peso,
      estatura,
      imc,
      grasaCorporal,
      cintura,
      cadera,
      observaciones,
      proximoObjetivo
    });

    res.status(201).json(nuevoSeguimiento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al guardar el seguimiento' });
  }
});

// Admin: eliminar un registro de seguimiento puntual (por si te equivocaste al capturarlo)
app.delete('/api/seguimientos/:id', verificarToken, async (req, res) => {
  try {
    await Seguimiento.findByIdAndDelete(req.params.id);
    res.json({ message: 'Registro eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar el registro' });
  }
});

/* ================= CATEGORÍAS DE RECETAS ================= */

// Público: listado de categorías (para el filtro)
app.get('/api/categorias-recetas', async (req, res) => {
  try {
    const categorias = await CategoriaReceta.find().sort({ orden: 1, nombre: 1 });
    res.json(categorias);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
});

// Admin: crear categoría
app.post('/api/categorias-recetas', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    const existe = await CategoriaReceta.findOne({ nombre: nombre.trim() });
    if (existe) {
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    }

    const nueva = await CategoriaReceta.create({ nombre: nombre.trim() });
    res.status(201).json(nueva);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear la categoría' });
  }
});

// Admin: editar categoría
app.put('/api/categorias-recetas/:id', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;

    const categoria = await CategoriaReceta.findByIdAndUpdate(
      req.params.id,
      { nombre: nombre.trim() },
      { new: true }
    );

    res.json(categoria);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al editar la categoría' });
  }
});

// Admin: eliminar categoría (las recetas que la usaban quedan "Sin categoría")
app.delete('/api/categorias-recetas/:id', verificarToken, async (req, res) => {
  try {
    await CategoriaReceta.findByIdAndDelete(req.params.id);
    await Receta.updateMany({ categoriaId: req.params.id }, { categoriaId: null });
    res.json({ message: 'Categoría eliminada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar la categoría' });
  }
});

/* ================= RECETAS ================= */

// Público: solo recetas activas
app.get('/api/recetas', async (req, res) => {
  try {
    const recetas = await Receta.find({ activo: true }).populate('categoriaId').sort({ createdAt: -1 });
    res.json(recetas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener recetas' });
  }
});

// Público: detalle de una receta
app.get('/api/recetas/:id', async (req, res) => {
  try {
    const receta = await Receta.findById(req.params.id);
    if (!receta) return res.status(404).json({ message: 'Receta no encontrada' });
    res.json(receta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener la receta' });
  }
});

// Público: calificar una receta (1 a 5)
app.post('/api/recetas/:id/calificar', async (req, res) => {
  try {
    const { puntuacion } = req.body;

    if (!puntuacion || puntuacion < 1 || puntuacion > 5) {
      return res.status(400).json({ message: 'Puntuación inválida' });
    }

    const receta = await Receta.findByIdAndUpdate(
      req.params.id,
      {
        $inc: {
          sumaCalificaciones: puntuacion,
          cantidadCalificaciones: 1
        }
      },
      { new: true }
    );

    if (!receta) return res.status(404).json({ message: 'Receta no encontrada' });

    res.json(receta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al calificar la receta' });
  }
});

// Admin: ver todas (activas e inactivas)
app.get('/api/recetas-admin/todas', verificarToken, async (req, res) => {
  try {
    const recetas = await Receta.find().populate('categoriaId').sort({ createdAt: -1 });
    res.json(recetas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener recetas' });
  }
});

// Admin: crear receta
app.post('/api/recetas-admin', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    const { nombre, descripcion, categoriaId, ingredientes, pasos, tiempoPreparacion, porciones } = req.body;

    if (!nombre) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    const foto = req.file ? req.file.path : null;

    const nuevaReceta = await Receta.create({
      nombre,
      descripcion,
      categoriaId: categoriaId || null,
      ingredientes: ingredientes ? JSON.parse(ingredientes) : [],
      pasos: pasos ? JSON.parse(pasos) : [],
      tiempoPreparacion,
      porciones,
      foto
    });

    const recetaConCategoria = await nuevaReceta.populate('categoriaId');
    res.status(201).json(recetaConCategoria);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear la receta' });
  }
});

// Admin: editar receta
app.put('/api/recetas-admin/:id', verificarToken, upload.single('foto'), async (req, res) => {
  try {
    const { nombre, descripcion, categoriaId, ingredientes, pasos, tiempoPreparacion, porciones, activo } = req.body;

    const datosActualizados = {
      nombre,
      descripcion,
      categoriaId: categoriaId || null,
      ingredientes: ingredientes ? JSON.parse(ingredientes) : [],
      pasos: pasos ? JSON.parse(pasos) : [],
      tiempoPreparacion,
      porciones,
      activo: activo === 'true' || activo === true
    };

    if (req.file) {
      datosActualizados.foto = req.file.path;
    }

    const receta = await Receta.findByIdAndUpdate(req.params.id, datosActualizados, { new: true }).populate('categoriaId');

    res.json(receta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al editar la receta' });
  }
});

// Admin: eliminar receta
app.delete('/api/recetas-admin/:id', verificarToken, async (req, res) => {
  try {
    await Receta.findByIdAndDelete(req.params.id);
    res.json({ message: 'Receta eliminada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar la receta' });
  }
});

/* ================= PRODUCTOS RECOMENDADOS (PDF) ================= */

// Público: obtener info del PDF actual
app.get('/api/recomendados', async (req, res) => {
  try {
    const config = await Recomendados.findOne();
    res.json(config || {});
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener la información' });
  }
});

// Admin: subir o reemplazar el PDF
app.put('/api/recomendados', verificarToken, uploadPdf.single('pdf'), async (req, res) => {
  try {
    const { titulo, descripcion } = req.body;

    const datosActualizados = { titulo, descripcion, actualizadoEn: new Date() };

    if (req.file) {
      datosActualizados.archivoPdf = req.file.path;
      datosActualizados.nombreArchivoOriginal = req.file.originalname;
    }

    let config = await Recomendados.findOne();

    if (config) {
      config = await Recomendados.findByIdAndUpdate(config._id, datosActualizados, { new: true });
    } else {
      config = await Recomendados.create(datosActualizados);
    }

    res.json(config);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || 'Error al guardar el PDF' });
  }
});

/* ================= SERVIDOR ================= */

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
}

module.exports = app;