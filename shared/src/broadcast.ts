export type ChangeTopic = 'students' | 'classes' | 'clinics' | 'attendance' | 'comments' | 'handover';

export interface ChangeMessage {
  type: 'changed';
  topic: ChangeTopic;
}
