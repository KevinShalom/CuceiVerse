export type TramiteRecord = {
  id: string;
  title: string;
  description: string;
  category:
    | 'Constancias'
    | 'Revalidación'
    | 'Bajas'
    | 'Académico'
    | 'Titulación'
    | 'Aclaraciones'
    | 'Servicios';
  time: string;
  cost: string;
  location: string;
  requirements: string[];
  aliases: string[];
  externalUrl?: string;
};

export const TRAMITES_DATA: TramiteRecord[] = [
  {
    id: '1',
    title: 'Copia certificada de acta de nacimiento',
    description:
      'En caso de que en el archivo de Control Escolar se encuentre tu Acta de Nacimiento, se te puede entregar una copia certificada de ésta.',
    category: 'Constancias',
    time: '3 días hábiles',
    cost: '$ 91.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Solicitar a través de la página oficial de SIATSE.',
      'Presentarse físicamente y recoger en la ventanilla de Control Escolar (Módulo A, Proulex).',
    ],
    aliases: [
      'acta de nacimiento',
      'copia certificada acta',
      'acta certificada',
    ],
  },
  {
    id: '2',
    title: 'Copia certificada del certificado de preparatoria',
    description:
      'En caso de que en el archivo de Control Escolar se encuentre tu Certificado de Preparatoria, se te puede entregar una copia certificada de éste.',
    category: 'Constancias',
    time: '3 días hábiles',
    cost: '$ 91.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Solicitar a través de la página oficial de SIATSE.',
      'Presentarse físicamente y recoger en la ventanilla de Control Escolar (Módulo A, Proulex).',
    ],
    aliases: [
      'certificado de preparatoria',
      'certificado de bachillerato',
      'copia certificada preparatoria',
    ],
  },
  {
    id: '3',
    title: 'Copia dictamen de acreditación',
    description:
      'Solo en caso de que ya tengas un trámite de Acreditación finalizado, puedes solicitar copia del dictamen emitido por la Comisión de Acreditación y Revalidación de Estudios.',
    category: 'Constancias',
    time: '3 días hábiles',
    cost: '$ 91.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Tener concluido un trámite formal de Acreditación.',
      'Solicitar el dictamen a través de la plataforma SIATSE.',
    ],
    aliases: [
      'dictamen de acreditación',
      'copia de dictamen',
      'dictamen acreditacion',
    ],
  },
  {
    id: '4',
    title: 'Constancia con calificaciones',
    description:
      'Documento que muestra las materias cursadas y aprobadas con calificación, créditos obtenidos, el ciclo cursado y el promedio obtenido hasta la emisión.',
    category: 'Constancias',
    time: '3 días hábiles',
    cost: '$ 63.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Solicitar directamente en el portal de SIATSE.',
      'Recoger el documento en ventanilla de Control Escolar con tu comprobante.',
    ],
    aliases: [
      'constancia con calificaciones',
      'constancia de calificaciones',
      'historial con calificaciones',
    ],
  },
  {
    id: '5',
    title: 'Constancia con Horario',
    description:
      'Documento que indica las materias, horarios y periodo del ciclo escolar del alumno.',
    category: 'Constancias',
    time: '1 día hábil',
    cost: '$ 39.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Registrar solicitud en SIATSE.',
      'Recibir o recoger el documento en ventanilla obligatoriamente después de las 13:00 hrs.',
    ],
    aliases: [
      'constancia con horario',
      'constancia de horario',
      'horario oficial',
    ],
  },
  {
    id: '6',
    title: 'Constancia de Ficha Tecnica',
    description:
      'Refleja de forma oficial el promedio general, promedio por ciclo escolar y el total de créditos obtenidos a la fecha.',
    category: 'Constancias',
    time: '1 día hábil',
    cost: '$ 39.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Registrar solicitud en SIATSE.',
      'Recibir o recoger el documento en ventanilla obligatoriamente después de las 13:00 hrs.',
    ],
    aliases: [
      'ficha técnica',
      'constancia de ficha técnica',
      'promedio por ciclo',
    ],
  },
  {
    id: '7',
    title: 'Constancia para beca',
    description:
      'Comprueba estado de alumno de licenciatura, muestra promedio total, promedio del semestre inmediato anterior, número de créditos y ciclo en curso.',
    category: 'Constancias',
    time: '1 día hábil',
    cost: '$ 39.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Registrar solicitud en SIATSE indicando uso para beca.',
      'Recoger emitido el documento después de las 13:00 hrs.',
    ],
    aliases: ['beca', 'constancia de beca', 'constancia para beca'],
  },
  {
    id: '8',
    title: 'Constancia sin Calificaciones',
    description:
      'Documento que menciona solo que eres alumno de la licenciatura, el inicio y termino del calendario vigente.',
    category: 'Constancias',
    time: '1 día hábil',
    cost: '$ 39.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Registrar solicitud en SIATSE.',
      'Acudir a reclamar el documento después de las 13:00 hrs.',
    ],
    aliases: [
      'constancia sin calificaciones',
      'constancia simple',
      'alumno inscrito',
    ],
  },
  {
    id: '9',
    title: 'Kardex Certificado',
    description:
      'Kardex oficial certificado por el Coordinador de Control Escolar con materias, créditos, promedios e inicio/fin del calendario.',
    category: 'Constancias',
    time: '1 día hábil',
    cost: '$ 39.00',
    location: 'Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Registrar solicitud en SIATSE.',
      'Recoger el documento físico después de las 13:00 hrs.',
    ],
    aliases: ['kardex', 'kardex certificado', 'historial certificado'],
  },
  {
    id: '10',
    title: 'Acreditación de materias (CUCEI o Incorporadas)',
    description:
      'Acreditación de materias para escuelas originarias de UDG o debidamente incorporadas.',
    category: 'Revalidación',
    time: 'Revisa el Calendario de Actividades Escolares',
    cost: '$ 68.00 por materia',
    location: 'Plataforma SIATSE / Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Esperar a ser formalmente admitido y estar en calendario de actividades.',
      'Ingresar a SIATSE -> Trámites Varios -> "Acreditación y Revalidación".',
      'Si es de UDG: Entregar Solicitud SIATSE, Kardex y Certificado en original y copia.',
      'Si es Incorporada: Entregar Solicitud SIATSE, Oficio de Igualdad, Kardex, Certificado y Programas de Materia en original.',
      'Si es Posgrado: Anexar Dictamen de la Junta Académica.',
    ],
    aliases: [
      'acreditación',
      'acreditación de materias',
      'revalidación udg',
      'incorporadas',
    ],
  },
  {
    id: '11',
    title: 'Revalidación de materias (Extranjero)',
    description:
      'Revalidación de materias cursadas en universidades fuera del país.',
    category: 'Revalidación',
    time: 'Revisa el Calendario de Actividades Escolares',
    cost: '$ 513.00 por materia',
    location: 'Plataforma SIATSE / Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Ingresar a SIATSE -> Trámites Varios -> "Acreditación y Revalidación".',
      'Entregar original y 2 copias de la Solicitud SIATSE y del Oficio de Igualdad del Coordinador.',
      'Entregar Kardex o Constancia, Certificado y Programas.',
      'El Certificado y los Programas deben venir apostillados.',
      'Si el idioma no es español, incluir traducción oficial.',
    ],
    aliases: [
      'revalidación extranjero',
      'revalidación internacional',
      'materias del extranjero',
      'apostillado',
    ],
  },
  {
    id: '12',
    title: 'Equivalencia de materias (Nacional)',
    description:
      'Acreditar materias cursadas en otras escuelas y universidades mexicanas que no son de UDG.',
    category: 'Revalidación',
    time: 'Revisa el Calendario de Actividades Escolares',
    cost: '$ 113.00 por materia',
    location: 'Plataforma SIATSE / Control Escolar (Modulo A, Proulex)',
    requirements: [
      'Ingresar a SIATSE -> Trámites Varios -> "Acreditación y Revalidación".',
      'Entregar original y 2 copias de la Solicitud SIATSE y Oficio del Coordinador.',
      'Entregar Kardex o Constancia con calificaciones.',
      'Entregar Certificado Parcial o Total y Programas de Materia totalmente originales.',
    ],
    aliases: [
      'equivalencia',
      'equivalencia nacional',
      'revalidación nacional',
      'otra universidad mexicana',
    ],
  },
  {
    id: '13',
    title: 'Baja de materias por artículo 8vo.',
    description:
      'Exclusivamente para dar de baja materias de área optativa abierta que estén en el plan.',
    category: 'Bajas',
    time: '5 días hábiles al cerrar',
    cost: 'Sin Costo',
    location: 'Plataforma SIATSE',
    requirements: [
      'Tener el ciclo actual totalmente pagado.',
      'Realizar obligatoriamente la semana anterior a la captura de calificación ordinaria.',
      'Iniciar sesión en SIATSE y solicitar en "Trámites varios" la baja por artículo 8vo.',
      'Solo se puede realizar 1 vez en toda la carrera.',
    ],
    aliases: ['artículo 8', 'baja por 8vo', 'baja de optativa'],
  },
  {
    id: '14',
    title: 'Solicitud para reingresar',
    description:
      'Solicitud de reingreso al centro universitario posterior a una inactividad o separación de estudios.',
    category: 'Bajas',
    time: '1 día hábil',
    cost: 'Depende de adeudo en SIIAU',
    location: 'Plataforma SIATSE',
    requirements: [
      'Pagar previamente todos tus adeudos con la UDG revisando en SIIAU.',
      'Ingresar cuenta en SIATSE con código y NIP.',
      'Solicitar trámite "Reingreso" dentro de la sección de Trámites varios.',
      'Consultar la respuesta directamente en la plataforma.',
    ],
    aliases: ['reingreso', 'volver a entrar', 'regresar a estudiar'],
  },
  {
    id: '15',
    title: 'Examen de acreditación por competencias',
    description:
      'Permite acreditar una materia demostrando habilidades teóricas o prácticas evaluables por el departamento.',
    category: 'Académico',
    time: '3 días hábiles',
    cost: '$ 1,086.00 por materia',
    location: 'Departamento correspondiente',
    requirements: [
      'Realizar la solicitud inicial directamente en el Departamento correspondiente.',
      'Esperar la evaluación y obtener la autorización explícita.',
      'Presentar la autorización en ventanilla de Control Escolar (Módulo A) para la orden de pago.',
    ],
    aliases: [
      'competencias',
      'acreditación por competencias',
      'examen por competencias',
    ],
  },
  {
    id: '16',
    title: 'Solicitud de baja voluntaria y retiro de documentos',
    description:
      'Baja total definitiva de tus estudios actuales en CUCEI y retiro de la documentación base personal de los archivos.',
    category: 'Bajas',
    time: 'Docs: Inmediato / SIIAU: 3 días',
    cost: '$ 10.00',
    location: 'Ventanilla Archivo (Modulo A, Proulex) / Plataforma SIATSE',
    requirements: [
      'Iniciar sesión en SIATSE y seleccionar "Trámites Disponibles".',
      'Consultar requisitos finales en la solicitud de baja.',
      'Imprimir el formato general, realizar el pago y entregar en la ventanilla de archivo.',
    ],
    aliases: ['baja voluntaria', 'retiro de documentos', 'darme de baja'],
  },
  {
    id: '17',
    title: 'Certificación de planes y programas de estudios',
    description:
      'Certificar los planes específicos cursados durante la trayectoria escolar, normalmente para apostillado.',
    category: 'Titulación',
    time: 'Variable por alumno',
    cost: 'Costo pendiente. Validado en archivo',
    location: 'Secretaría Académica / Control Escolar General',
    requirements: [
      'Obtener copias de planes de estudio avalados por Coordinador y Secretario de División.',
      'Solicitar en Secretaría Académica el oficio formal de certificación.',
      'Acudir al archivo de Coordinación de Control Escolar del CUCEI para la orden de pago.',
      'Tras pagar, liquidar presentando documentos en Coordinación de Control Escolar General (Av. Juárez piso -1).',
      'Si se requiere legalización por Gobierno del Estado, acudir a Prolongación Alcalde #1855.',
    ],
    aliases: ['planes y programas', 'certificación de estudios', 'apostillado'],
  },
  {
    id: '18',
    title: 'Acta de Titulación',
    description:
      'Adquisición de copias certificadas del acta formal de titulación y grado escolar. Requiere estatus Graduado.',
    category: 'Titulación',
    time: '5 días hábiles en Módulo A',
    cost: '$ 91.00',
    location: 'Ventanilla Egresados',
    requirements: [
      'Verificar tener estatus obligatorio de "Graduado" en sistema.',
      'Realizar e iniciar trámite en SIATSE en la zona de "Copias Certificadas".',
      'Presentarse físicamente a ventanilla de Egresados (Módulo A) con el comprobante SIATSE impreso.',
      'Mostrar una identificación oficial vigente.',
    ],
    aliases: [
      'acta de titulación',
      'acta de titulacion',
      'copia de acta de titulación',
    ],
  },
  {
    id: '19',
    title: 'Copia certificada de certificado de bachillerato',
    description:
      'Solicita documentos y constancias de tu expediente cerrado correspondiente a la etapa de media superior.',
    category: 'Titulación',
    time: '3 días hábiles en Archivo',
    cost: '$ 91.00',
    location: 'Ventanilla Archivo (Módulo A)',
    requirements: [
      'Iniciar el trámite desde la cuenta SIATSE, bajo la sección de "Copias Certificadas".',
      'Acudir de forma presencial a la ventanilla de archivo en Control Escolar.',
      'Presentar el comprobante de trámite impreso y una identificación oficial vigente.',
    ],
    aliases: [
      'certificado de bachillerato',
      'copia certificada bachillerato',
      'media superior',
    ],
  },
  {
    id: '20',
    title: 'Constancia de no adeudo a la Universidad',
    description:
      'Documento acreditativo de que el estudiante no posee deudas académicas, administrativas, financieras ni de biblioteca con la UDG.',
    category: 'Titulación',
    time: '3 días hábiles a tu correo',
    cost: 'Dependiendo de deuda',
    location: 'Ventanilla Egresados (Módulo A)',
    requirements: [
      'Solicitar y presentarse en la ventanilla de Egresados (Módulo A, Proulex).',
      'Presentar de forma física comprobante académico original.',
      'Presentar carta o comprobante de término de servicio social en original.',
    ],
    aliases: ['no adeudo', 'constancia de no adeudo', 'sin deudas'],
  },
  {
    id: '21',
    title: 'Formato para validación de estudios',
    description:
      'Formulario oficial para ser llenado por instituciones de procedencia buscando reconocer y validar créditos.',
    category: 'Académico',
    time: 'Inmediato (Formato Libre)',
    cost: 'Sin Costo',
    location: 'Ventanilla Archivo (Modulo A, Proulex)',
    requirements: [
      'Comunicarse con la escuela de procedencia para obtener datos precisos.',
      'Descargar oficialmente el PDF del formato.',
      'Imprimir, llenar los datos completos y entregar en la ventanilla principal de archivo.',
    ],
    aliases: [
      'validación de estudios',
      'validar estudios',
      'formato validación',
    ],
    externalUrl: 'https://escolar.cucei.udg.mx/cescolar/docs/validacion.pdf',
  },
  {
    id: '22',
    title: 'Solicitud de licencia (Excepto posgrados)',
    description:
      'Pausa estudiantil o suspensión parcial para conservar derechos educativos y no perder dictamen.',
    category: 'Académico',
    time: '5 días hábiles (Consulta SIATSE)',
    cost: 'Sin Costo',
    location: 'Plataforma SIATSE',
    requirements: [
      'Realizar la solicitud solo en las fechas designadas en el Calendario de Actividades.',
      'No presentar adeudos monetarios de matrícula.',
      'No mantener ninguna materia en estado de reprobada.',
      'Ingresar a SIATSE -> "Trámites disponibles" -> "Solicitud de Licencia".',
      'Para posgrados debe tratarse con su coordinador local.',
    ],
    aliases: ['licencia', 'solicitud de licencia', 'pausa de estudios'],
  },
  {
    id: '23',
    title: 'Solicitud de Oportunidad por incurrir en Art. 33',
    description:
      'Mecanismo de excepción legal o prórroga administrativa otorgada a estudiantes en estatus de artículo por fallar materias.',
    category: 'Aclaraciones',
    time: 'Revisión en 3 semanas aprox.',
    cost: 'Sin Costo',
    location: 'Plataforma SIATSE',
    requirements: [
      'Realizar primero en SIIAU el pago en ceros de cualquier adeudo general pendiente.',
      'Asegurarse de hacerlo dentro de los tiempos del calendario de actividades vigente.',
      'Ingresar a SIATSE con la sesión normal.',
      'Presionar en "Trámites disponibles" y buscar "Solicitud de oportunidad".',
      'El estatus de resolución varía con cortes máximos: 31 Jul (Calendario A) y 16 Ene (Calendario B).',
    ],
    aliases: [
      'artículo 33',
      'articulo 33',
      'solicitud de oportunidad',
      'oportunidad 33',
    ],
  },
  {
    id: '24',
    title: 'Trámite de alta en IMSS como estudiante',
    description:
      'Proceso de incorporación al servicio médico social provisto de forma facultativa por ser estudiante inscrito.',
    category: 'Servicios',
    time: 'Inmediata directamente por portal',
    cost: 'Sin Costo',
    location: 'Plataforma SIATSE',
    requirements: [
      'Ingresar a la plataforma del SIATSE y encontrar dicho trámite.',
      'Leer, guardar o imprimir el archivo Anexo descriptivo del trámite.',
      'Seguir los pasos de navegación al sistema nacional que describe el anexo.',
    ],
    aliases: ['imss', 'seguro facultativo', 'alta imss'],
  },
  {
    id: '25',
    title: '¿Por qué tengo artículo 34 si ya pasé la materia?',
    description:
      'Proceso de clarificación para errores o intermitencias donde una materia aprobada figura en Art. 34.',
    category: 'Aclaraciones',
    time: 'Evaluación rápida de 1 día hábil',
    cost: 'Sin Costo',
    location: 'Plataforma SIATSE / Ficha Técnica',
    requirements: [
      'Consultar primero tu ficha técnica original en SIIAU y constatar fechas de vigencia.',
      'Reconocer que los estatus solo se actualizan entre el término de un ciclo y el inicio del nuevo.',
      'Si validas un estatus incorrecto, entra urgentemente a tu cuenta en SIATSE.',
      'Ir a "Trámites disponibles", seleccionar "Aclaración de Estatus" y seguir las instrucciones.',
    ],
    aliases: [
      'artículo 34',
      'articulo 34',
      'ya pasé la materia',
      'aclaración de estatus',
    ],
  },
  {
    id: '26',
    title: 'Aclaración de agenda de auto-registro',
    description:
      'Apelación del orden y fechas provistas por Control y Registro Escolar para tu carga del siguiente ciclo.',
    category: 'Aclaraciones',
    time: 'Respuesta en 1 día hábil',
    cost: 'Sin Costo',
    location: 'Plataforma SIATSE',
    requirements: [
      'Haber cumplido los periodos previos y haber hecho correctamente el Pre-Registro.',
      'Aceptar que la agenda se compone por la combinación entre pre-registro y promedio neto.',
      'Hacer el cuestionamiento en SIATSE solo después de la publicación oficial de la agenda.',
      'Localizar el reporte en "Trámites Varios" -> "Aclaración de tu Agenda".',
    ],
    aliases: [
      'agenda de auto registro',
      'agenda de registro',
      'aclaración de agenda',
    ],
  },
];
