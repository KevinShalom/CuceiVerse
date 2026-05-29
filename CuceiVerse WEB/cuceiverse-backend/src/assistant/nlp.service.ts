import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// @ts-ignore
import { NlpManager } from 'node-nlp';

export type NlpExtractedEntity = {
  start: number;
  end: number;
  len: number;
  accuracy: number;
  sourceText: string;
  utteranceText: string;
  entity: string;
  resolution?: {
    value?: string;
  };
};

export type NlpClassificationResult = {
  intent:
    | 'academic_search'
    | 'administrative'
    | 'navigation'
    | 'platform'
    | 'general'
    | 'None';
  score: number;
  entities: NlpExtractedEntity[];
  answer?: string;
  utterance: string;
};

@Injectable()
export class NlpService implements OnModuleInit {
  private readonly logger = new Logger(NlpService.name);
  private manager: any;

  constructor() {
    this.manager = new NlpManager({
      languages: ['es'],
      forceNER: true,
      autoSave: false,
    });
  }

  async onModuleInit() {
    this.logger.log('Training internal NLP model (Spanish)...');
    this.trainModel();
    const startTime = Date.now();
    await this.manager.train();
    this.logger.log(
      `NLP model trained successfully in ${Date.now() - startTime}ms.`,
    );
  }

  public async process(message: string): Promise<NlpClassificationResult> {
    const response = await this.manager.process('es', message.toLowerCase());
    return {
      intent: response.intent,
      score: response.score,
      entities: response.entities || [],
      answer: response.answer,
      utterance: response.utterance,
    };
  }

  private trainModel() {
    this.addCorpus('es', 'navigation', [
      'como llego a',
      'como llego al modulo x',
      'como llego a los baños del q',
      'como llegar a',
      'donde esta el',
      'donde esta la',
      'donde queda',
      'ruta para',
      'llevame a',
      'guiame a',
      'quiero ir a',
      'como llegar a',
      'ensename el camino a',
      'muestrame la ruta a',
      'que hay cerca de ahi',
      'cual es la ruta mas corta',
      'llevame al siguiente edificio',
      'me encuentro en el x',
      'estoy en baños del q',
      'ando por control escolar',
      'estoy en el modulo u',
    ]);

    this.addCorpus('es', 'platform', [
      'como cambio mi avatar',
      'como funciona cuceiverse',
      'para que sirve esto',
      'como vinculo siiau',
      'como conecto mi cuenta',
      'grupos de estudio',
      'donde veo mi perfil rpg',
      'que es cuceiverse',
      'como edito a mi monito',
      'como uso el mapa',
    ]);

    this.addCorpus('es', 'administrative', [
      'tramites escolares',
      'tramites administrativos',
      'cuanto cuesta la constancia para beca',
      'necesito una constancia de beca',
      'como saco mi kardex certificado',
      'donde entrego los papeles de revalidacion',
      'que hago si tengo articulo 33',
      'que hago si tengo articulo 34',
      'como tramito mi licencia',
      'como hago reingreso',
      'como saco una copia certificada',
      'tramite de imss',
      'requisitos de titulacion',
      'donde esta control escolar',
      'donde entrego eso',
      'que documentos piden para ese tramite',
      'y luego a donde voy',
      'que sigue despues de siatse',
      'cuanto tarda ese tramite',
    ]);

    this.addCorpus('es', 'general', [
      'que clases tengo hoy',
      'dime mi primera clase del lunes',
      'que clases tengo el martes',
      'a que hora entro el viernes',
      'a que hora entro manana',
      'cual es mi promedio',
      'cuantos creditos llevo',
      'que materias llevo este semestre',
      'cuales clases tengo',
      'dime mi horario de hoy',
      'mi siguiente clase',
      'que toca hoy',
      'mi avance',
      'hola',
      'que onda',
      'buenos dias',
      'quien eres',
      'como te llamas',
    ]);

    this.addCorpus('es', 'academic_search', [
      'que materias da el profe',
      'que clases imparte',
      'quien da la materia de',
      'quien da esa materia',
      'quien ensena',
      'a que hora es la clase de',
      'a que hora es esa materia',
      'a que hora dan',
      'horario de la materia',
      'donde dan la materia de',
      'en que edificio es esa materia',
      'donde es la clase de',
      'en que edificio da clases',
      'materias en el modulo',
      'que clases hay en el edificio',
      'dime materias en',
      'buscar seccion',
      'oferta de',
      'que clases hay en el',
      'hay clases en el',
      'materias en el u',
      'que materias virtuales hay',
      'que materias hibridas hay',
      'que clases presenciales hay',
    ]);

    const buildingRegex =
      /\b(?:en el|al|edificio|modulo|módulo|auditorio|el)(?:\s+de)?\s+([a-zA-Z0-9]{1,15}(?:\s+[a-zA-Z0-9]+)?)\b/i;
    this.manager.addRegexEntity('building', ['es'], buildingRegex);

    const professorRegex =
      /\b(?:profe|profesor|profesora|maestro|maestra)(?:\s+de)?\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?)\b/i;
    this.manager.addRegexEntity('professor', ['es'], professorRegex);

    const subjectRegex =
      /\b(?:la clase de|la materia de|clase de|materia de|clases de|clases hay de|materias hay de)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+)(?:\s+en|\s+con|\s+a\s+las|$)/i;
    this.manager.addRegexEntity('subject', ['es'], subjectRegex);

    const timeRegex = /\b(?:a las|hora)\s+([0-9]{1,2}(?::[0-9]{2})?)\b/i;
    this.manager.addRegexEntity('time', ['es'], timeRegex);
  }

  private addCorpus(lang: string, intent: string, phrases: string[]) {
    for (const phrase of phrases) {
      this.manager.addDocument(lang, phrase, intent);
    }
  }
}
