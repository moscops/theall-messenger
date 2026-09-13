export type ChangeTopic = 'students' | 'classes' | 'clinics' | 'attendance' | 'comments';

export interface ChangeMessage {
  type: 'changed';
  topic: ChangeTopic;
}
