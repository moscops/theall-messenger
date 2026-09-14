import { useState } from 'react';
import type { Class, ClinicAssignment, ScheduleException, Student, StudentComment } from '@theall/shared';
import { DAY_LABELS } from '../dayOfWeek';
import {
  ClassIcon,
  ClinicIcon,
  CloseIcon,
  CommentIcon,
  ExceptionIcon,
  StudentIcon,
  UserIcon
} from './icons';

interface StudentDetailPanelProps {
  student: Student;
  allStudents: Student[];
  classes: Class[];
  clinics: ClinicAssignment[];
  exceptions: ScheduleException[];
  comments: StudentComment[];
  onClose: () => void;
  onEdit: (student: Student) => void;
  onDelete: (studentId: string) => void;
  onAddComment: (studentId: string, content: string, author: string) => Promise<void>;
  onSelectStudent: (student: Student) => void;
}

export function StudentDetailPanel({
  student,
  allStudents,
  classes,
  clinics,
  exceptions,
  comments,
  onClose,
  onEdit,
  onDelete,
  onAddComment,
  onSelectStudent
}: StudentDetailPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'exceptions' | 'comments'>('schedule');
  const [newComment, setNewComment] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Enrolled classes
  const studentClasses = classes.filter((c) => c.studentIds.includes(student.id));
  // Assigned clinics
  const studentClinics = clinics.filter((c) => c.studentId === student.id);
  // Exceptions for this student
  const studentExceptions = exceptions.filter((e) => e.studentId === student.id);
  // Comments for this student
  const studentComments = comments.filter((c) => c.studentId === student.id);
  // Sibling student records
  const siblings = allStudents.filter((s) => student.siblingIds?.includes(s.id));

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !commentAuthor.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddComment(student.id, newComment.trim(), commentAuthor.trim());
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="notion-side-peek-backdrop" onClick={onClose}>
      <div className="notion-side-peek" onClick={(e) => e.stopPropagation()}>
        {/* Top Action Bar */}
        <div className="peek-header">
          <div className="peek-badge">
            <StudentIcon size={13} className="inline-icon" />
            <span>학생 페이지</span>
          </div>
          <div className="peek-actions">
            <button type="button" className="peek-action-btn" onClick={() => onEdit(student)}>
              수정
            </button>
            <button type="button" className="peek-action-btn danger" onClick={() => onDelete(student.id)}>
              삭제
            </button>
            <button type="button" className="peek-close-btn" onClick={onClose} title="닫기">
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Title / Hero */}
        <div className="peek-hero">
          <div className="peek-icon-box">
            <StudentIcon size={26} color="#2383e2" />
          </div>
          <h1 className="peek-title">{student.name}</h1>
        </div>

        {/* Properties Table (Notion Property Style) */}
        <div className="peek-properties">
          <div className="peek-property-row">
            <span className="prop-name">학년/반</span>
            <span className="prop-val">{student.grade || <span className="empty-val">미입력</span>}</span>
          </div>
          <div className="peek-property-row">
            <span className="prop-name">학교</span>
            <span className="prop-val">{student.schoolName || <span className="empty-val">미입력</span>}</span>
          </div>
          <div className="peek-property-row">
            <span className="prop-name">성별</span>
            <span className="prop-val">
              {student.gender === 'male' ? '남학생' : student.gender === 'female' ? '여학생' : <span className="empty-val">미선택</span>}
            </span>
          </div>
          <div className="peek-property-row">
            <span className="prop-name">학생 연락처</span>
            <span className="prop-val">{student.phone || <span className="empty-val">미입력</span>}</span>
          </div>
          <div className="peek-property-row">
            <span className="prop-name">학부모 연락처</span>
            <span className="prop-val">{student.parentPhone || <span className="empty-val">미입력</span>}</span>
          </div>
          <div className="peek-property-row">
            <span className="prop-name">형제자매</span>
            <div className="prop-val-tags">
              {siblings.length > 0 ? (
                siblings.map((sib) => (
                  <button
                    key={sib.id}
                    type="button"
                    className="notion-relation-chip"
                    onClick={() => onSelectStudent(sib)}
                  >
                    <UserIcon size={12} className="inline-icon" />
                    <span>{sib.name} ({sib.grade || '학년미정'})</span>
                  </button>
                ))
              ) : (
                <span className="empty-val">없음</span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="peek-divider" />

        {/* Sub Navigation Tabs */}
        <div className="peek-tabs">
          <button
            type="button"
            className={`peek-tab ${activeSubTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('schedule')}
          >
            <ClassIcon size={14} className="inline-icon" />
            <span>수강 수업 및 클리닉 ({studentClasses.length + studentClinics.length})</span>
          </button>
          <button
            type="button"
            className={`peek-tab ${activeSubTab === 'exceptions' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('exceptions')}
          >
            <ExceptionIcon size={14} className="inline-icon" />
            <span>예외 이력 ({studentExceptions.length})</span>
          </button>
          <button
            type="button"
            className={`peek-tab ${activeSubTab === 'comments' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('comments')}
          >
            <CommentIcon size={14} className="inline-icon" />
            <span>코멘트 ({studentComments.length})</span>
          </button>
        </div>

        {/* Sub Content */}
        <div className="peek-tab-content">
          {activeSubTab === 'schedule' && (
            <div className="peek-schedule-section">
              <h4>수업 일정</h4>
              {studentClasses.length === 0 ? (
                <p className="empty-text">수강 중인 수업이 없습니다.</p>
              ) : (
                <div className="peek-card-list">
                  {studentClasses.map((cls) => (
                    <div key={cls.id} className="peek-item-card">
                      <div className="card-title">
                        <strong>{cls.name}</strong>
                        <span className="card-badge blue">선생님: {cls.teacherName}</span>
                      </div>
                      <div className="card-slots">
                        {cls.schedule.map((slot, i) => (
                          <span key={i} className="time-tag">
                            {DAY_LABELS[slot.dayOfWeek]} {slot.startTime}~{slot.endTime}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h4 style={{ marginTop: '20px' }}>클리닉 배정</h4>
              {studentClinics.length === 0 ? (
                <p className="empty-text">배정된 클리닉이 없습니다.</p>
              ) : (
                <div className="peek-card-list">
                  {studentClinics.map((clinic) => (
                    <div key={clinic.id} className="peek-item-card">
                      <div className="card-title">
                        <strong>개별 클리닉</strong>
                        <span className="card-badge purple">조교 감독</span>
                      </div>
                      <div className="card-slots">
                        <span className="time-tag">
                          {DAY_LABELS[clinic.dayOfWeek]} {clinic.startTime}~{clinic.endTime}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'exceptions' && (
            <div className="peek-exceptions-section">
              {studentExceptions.length === 0 ? (
                <p className="empty-text">등록된 일정 예외(결석/보충/시간변경)가 없습니다.</p>
              ) : (
                <div className="peek-card-list">
                  {studentExceptions.map((ex) => (
                    <div key={ex.id} className="peek-item-card">
                      <div className="card-title">
                        <span
                          className={`card-badge ${
                            ex.exceptionType === 'absence'
                              ? 'red'
                              : ex.exceptionType === 'reschedule'
                              ? 'blue'
                              : 'orange'
                          }`}
                        >
                          {ex.exceptionType === 'absence'
                            ? '결석'
                            : ex.exceptionType === 'reschedule'
                            ? '시간변경'
                            : '보충추가'}
                        </span>
                        <span className="card-date">{ex.date}</span>
                      </div>
                      {ex.reason && <p className="card-desc">사유: {ex.reason}</p>}
                      {ex.newDate && (
                        <p className="card-meta">
                          변경/보충 일시: {ex.newDate} {ex.newStartTime}~{ex.newEndTime}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'comments' && (
            <div className="peek-comments-section">
              <form onSubmit={handleCommentSubmit} className="peek-comment-form">
                <input
                  placeholder="작성자 (예: 조교A, 김선생님)"
                  value={commentAuthor}
                  onChange={(e) => setCommentAuthor(e.target.value)}
                  required
                />
                <textarea
                  placeholder="학생에 대한 코멘트를 작성하세요..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  required
                />
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? '저장 중...' : '코멘트 남기기'}
                </button>
              </form>

              <div className="peek-card-list" style={{ marginTop: '14px' }}>
                {studentComments.length === 0 ? (
                  <p className="empty-text">남겨진 코멘트가 없습니다.</p>
                ) : (
                  studentComments.map((comm) => (
                    <div key={comm.id} className="peek-comment-card">
                      <div className="comment-header">
                        <span className="comment-author">
                          <UserIcon size={12} className="inline-icon" /> {comm.author}
                        </span>
                        {comm.date && <span className="comment-date">{comm.date}</span>}
                      </div>
                      <p className="comment-body">{comm.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
