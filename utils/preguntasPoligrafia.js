// Preguntas de poligrafía — fuente única compartida entre controllers
const PREGUNTAS_POLIGRAFIA = [
  { numero: 1,  categoria: 'Control',              pregunta: '¿Su nombre es [Nombre del Candidato]?' },
  { numero: 2,  categoria: 'Control',              pregunta: '¿Está diciendo la verdad en esta evaluación?' },
  { numero: 3,  categoria: 'Control',              pregunta: '¿Tiene intención de mentir en alguna respuesta?' },
  { numero: 4,  categoria: 'Integridad Laboral',   pregunta: '¿Ha sido despedido de empleos anteriores por robo?' },
  { numero: 5,  categoria: 'Integridad Laboral',   pregunta: '¿Ha robado en algún trabajo anterior?' },
  { numero: 6,  categoria: 'Integridad Laboral',   pregunta: '¿Ha ocultado información importante a un empleador?' },
  { numero: 7,  categoria: 'Integridad Laboral',   pregunta: '¿Ha falsificado documentos o información laboral?' },
  { numero: 8,  categoria: 'Integridad Laboral',   pregunta: '¿Ha participado en actos de sabotaje dentro de una empresa?' },
  { numero: 9,  categoria: 'Actividades Ilícitas', pregunta: '¿Ha participado en actividades ilícitas?' },
  { numero: 10, categoria: 'Actividades Ilícitas', pregunta: '¿Ha cometido un delito que no haya sido descubierto?' },
  { numero: 11, categoria: 'Actividades Ilícitas', pregunta: '¿Ha obtenido dinero de forma ilegal?' },
  { numero: 12, categoria: 'Actividades Ilícitas', pregunta: '¿Ha participado en estafas?' },
  { numero: 13, categoria: 'Actividades Ilícitas', pregunta: '¿Ha lavado dinero o ayudado a alguien a hacerlo?' },
  { numero: 14, categoria: 'Sustancias',           pregunta: '¿Consume sustancias ilícitas?' },
  { numero: 15, categoria: 'Sustancias',           pregunta: '¿Ha consumido drogas en el último año?' },
  { numero: 16, categoria: 'Sustancias',           pregunta: '¿Ha vendido sustancias ilícitas?' },
  { numero: 17, categoria: 'Sustancias',           pregunta: '¿Ha trabajado bajo efectos de alcohol o drogas?' },
  { numero: 18, categoria: 'Seguridad',            pregunta: '¿Su intención al entrar a esta empresa es obtener y divulgar información confidencial?' },
  { numero: 19, categoria: 'Seguridad',            pregunta: '¿Tiene familiares que han estado involucrados en el crimen organizado?' },
  { numero: 20, categoria: 'Seguridad',            pregunta: '¿Ha aceptado sobornos?' },
  { numero: 21, categoria: 'Seguridad',            pregunta: '¿Ha proporcionado información interna a terceros?' },
  { numero: 22, categoria: 'Veracidad',            pregunta: '¿Ha mentido en esta solicitud?' },
  { numero: 23, categoria: 'Veracidad',            pregunta: '¿Tiene conflictos financieros graves?' },
  { numero: 24, categoria: 'Veracidad',            pregunta: '¿Ha mentido en alguna pregunta anterior?' }
];

module.exports = PREGUNTAS_POLIGRAFIA;
