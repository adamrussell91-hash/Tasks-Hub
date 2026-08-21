import { TransitMapSchema, type TransitMap } from '@/schemas/map';

const STAMP = '2026-08-20T00:00:00.000Z';

function col(id: string, name: string, letter: string, color: TransitMap['lines'][number]['color'], x: number) {
  return {
    id,
    name,
    letter,
    color,
    points: [
      { x, y: 40 },
      { x, y: 1040 }
    ]
  };
}

export function mindWorks2026Map(): TransitMap {
  return TransitMapSchema.parse({
    schema_version: 1,
    id: 'map_mindworks_2026',
    title: 'MindWorks 2026',
    year: 2026,
    created_at: STAMP,
    updated_at: STAMP,
    lines: [
      col('line_justice', 'Justice', 'J', 'wave', 120),
      col('line_innovation', 'Innovation', 'I', 'success', 340),
      col('line_expression', 'Expression', 'E', 'lilac', 560),
      col('line_reasoning', 'Reasoning', 'R', 'high-sea-ink', 780)
    ],
    stations: [
      {
        id: 'st_ydp',
        line_id: 'line_justice',
        label: 'Young Diplomats Program',
        y: 80,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_advocacy',
        line_id: 'line_justice',
        label: 'Diplomacy and Advocacy',
        y: 240,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_mock',
        line_id: 'line_justice',
        label: 'NSW Law Society Mock Trial',
        y: 420,
        height: 110,
        in_stroke: 'dotted',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_ycl',
        line_id: 'line_innovation',
        label: 'Young Creators Lab',
        y: 80,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_future',
        line_id: 'line_innovation',
        label: 'Future Solutions Lab',
        y: 420,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_studio',
        line_id: 'line_expression',
        label: 'StudioGAT',
        y: 80,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_psych',
        line_id: 'line_reasoning',
        label: 'Foundations Psychology',
        y: 80,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      },
      {
        id: 'st_ethics',
        line_id: 'line_reasoning',
        label: 'Foundations Ethics and Philosophy',
        y: 240,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        link: null
      }
    ],
    ticks: [
      {
        id: 'tk_muna',
        label: 'Rotary MUNA',
        attach: { kind: 'line', line_id: 'line_justice', y: 200 },
        stroke: 'solid',
        connects_to: null,
        link: null
      },
      {
        id: 'tk_locke',
        label: 'John Locke Essay Competition',
        attach: { kind: 'station', station_id: 'st_mock', side: 'right', offset: 0.35 },
        stroke: 'solid',
        connects_to: 'Connects to Reasoning',
        link: null
      },
      {
        id: 'tk_moot',
        label: 'Bond University Mooting',
        attach: { kind: 'station', station_id: 'st_mock', side: 'right', offset: 0.7 },
        stroke: 'dotted',
        connects_to: null,
        link: null
      },
      {
        id: 'tk_davinci',
        label: 'da Vinci Decathlon',
        attach: { kind: 'line', line_id: 'line_innovation', y: 260 },
        stroke: 'solid',
        connects_to: null,
        link: null
      },
      {
        id: 'tk_unsw',
        label: 'UNSW Mathematics Competition',
        attach: { kind: 'line', line_id: 'line_innovation', y: 300 },
        stroke: 'solid',
        connects_to: null,
        link: null
      },
      {
        id: 'tk_evatt',
        label: 'UN Evatt Competition',
        attach: { kind: 'station', station_id: 'st_advocacy', side: 'right', offset: 0.45 },
        stroke: 'solid',
        connects_to: null,
        link: null
      }
    ]
  });
}
