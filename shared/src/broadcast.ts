export type ChangeTopic = 'students' | 'classes' | 'clinics';

export interface ChangeMessage {
  type: 'changed';
  topic: ChangeTopic;
}
