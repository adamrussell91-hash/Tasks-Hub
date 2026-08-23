export type ClareProtocolId =
  | 'estimate-it'
  | 'choose-framework'
  | 'stress-test'
  | 'flag-pinch'
  | 'shrink-first-step';

export type ClareProtocol = {
  id: ClareProtocolId;
  label: string;
  explain: string;
};

export const CLARE_PROTOCOLS: readonly ClareProtocol[] = [
  {
    id: 'estimate-it',
    label: 'Estimate this',
    explain: 'Clare calibrates a realistic time boundary from the task and your history.'
  },
  {
    id: 'choose-framework',
    label: 'Pick a framework',
    explain: 'Clare chooses the planning framework that best fits this kind of work.'
  },
  {
    id: 'stress-test',
    label: 'Stress-test this',
    explain: 'Clare checks the proposal for hidden effort and an overambitious scope.'
  },
  {
    id: 'flag-pinch',
    label: 'Flag a pinch',
    explain: 'Clare surfaces the priority or deadline pressure most likely to cause a pinch.'
  },
  {
    id: 'shrink-first-step',
    label: 'Shrink the first move',
    explain: 'Clare turns the task into a small first move you can start without ceremony.'
  }
];

export const CLARE_WAIT_LINES = [
  'Untangling the moving parts…',
  'Putting a timer on the chaos…',
  'Checking where this could pinch…',
  'Finding the smallest honest first move…',
  'Measuring the task against the week…',
  'Testing the estimate for wishful thinking…',
  'Choosing a framework that earns its keep…',
  'Separating urgent from merely noisy…',
  'Looking for effort hiding in the seams…',
  'Turning the knot into a next action…',
  'Checking the deadline has enough runway…',
  'Making the plan smaller and truer…'
] as const;

