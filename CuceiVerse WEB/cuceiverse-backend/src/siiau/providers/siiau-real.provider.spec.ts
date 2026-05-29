import { SiiauRealProvider } from './siiau-real.provider';

describe('SiiauRealProvider', () => {
  const extractCompleted = (html: string) => {
    const provider = new SiiauRealProvider();
    return (
      provider as unknown as {
        extractClassesFromTables: (
          sourceHtml: string,
          statusHints: string[],
        ) => Array<{
          id: string;
          name: string;
          grade?: number | null;
          description?: string | null;
        }>;
      }
    ).extractClassesFromTables(html, [
      'APROBAD',
      'ACREDIT',
      'ORDINARIO',
      'EXTRAORDINARIO',
    ]);
  };

  it('prioriza la columna de calificacion cuando el kardex expone encabezados', () => {
    const html = `
      <table>
        <tr>
          <th>Clave</th>
          <th>Materia</th>
          <th>Cr</th>
          <th>Calificacion</th>
          <th>Estado</th>
          <th>Ciclo</th>
        </tr>
        <tr>
          <td>I5914</td>
          <td>Inteligencia Artificial</td>
          <td>8</td>
          <td>95</td>
          <td>Aprobado en ordinario</td>
          <td>202420</td>
        </tr>
      </table>
    `;

    expect(extractCompleted(html)).toEqual([
      {
        id: 'I5914',
        name: 'Inteligencia Artificial',
        grade: 95,
        description: 'Materia acreditada en Kardex. Estado: Aprobado en ordinario.',
      },
    ]);
  });

  it('usa la mejor heuristica disponible cuando no hay encabezados pero evita tomar el ciclo como calificacion', () => {
    const html = `
      <table>
        <tr>
          <td>I7020</td>
          <td>Modelado y Simulacion</td>
          <td>202420</td>
          <td>7</td>
          <td>88</td>
          <td>Acreditado</td>
        </tr>
      </table>
    `;

    expect(extractCompleted(html)).toEqual([
      {
        id: 'I7020',
        name: 'Modelado y Simulacion',
        grade: 88,
        description: 'Materia acreditada en Kardex. Estado: Acreditado.',
      },
    ]);
  });
});