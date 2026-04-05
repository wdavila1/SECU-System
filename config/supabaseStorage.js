const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

// Inicializar supabase solo si las variables de entorno estan configuradas
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Funcion para subir archivos
const uploadFile = async (bucket, filePath, file, contentType) => {
  if (!supabase) {
    console.warn('Supabase no configurado - archivo no subido');
    return null;
  }
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        contentType: contentType,
        upsert: true
      });
    
    if (error) throw error;
    
    // Obtener URL pública
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error subiendo archivo:', error);
    throw error;
  }
};

// Funcion para eliminar archivos
const deleteFile = async (bucket, filePath) => {
  if (!supabase) {
    console.warn('Supabase no configurado - archivo no eliminado');
    return false;
  }
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error eliminando archivo:', error);
    throw error;
  }
};

// Convertir imagen a WebP si es imagen (no PDF ni GIF)
const convertirAWebP = async (buffer, mimetype) => {
  const esImagen = mimetype && mimetype.startsWith('image/') && mimetype !== 'image/gif';
  if (!esImagen) return { buffer, mimetype, extension: null };

  try {
    const webpBuffer = await sharp(buffer)
      .webp({ quality: 85 })
      .toBuffer();
    return { buffer: webpBuffer, mimetype: 'image/webp', extension: '.webp' };
  } catch (e) {
    console.warn('No se pudo convertir a WebP, usando original:', e.message);
    return { buffer, mimetype, extension: null };
  }
};

module.exports = { supabase, uploadFile, deleteFile, convertirAWebP };
