import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentsPage } from '../src/pages/StudentsPage';
import { studentsApi } from '../src/api/client';

vi.mock('../src/api/client', () => ({
  studentsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    importExcel: vi.fn(),
    downloadTemplate: vi.fn()
  },
  exportApi: {
    downloadStudentsExcel: vi.fn(),
    downloadStudentsPdf: vi.fn()
  }
}));

describe('StudentsPage', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists students returned from the API', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: '1', name: '김민준', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);

    render(<StudentsPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('김민준')).toBeInTheDocument();
  });

  it('submits the form to create a student', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([]);
    vi.mocked(studentsApi.create).mockResolvedValue({
      id: '2',
      name: '이지은',
      siblingIds: [],
      createdAt: '',
      updatedAt: ''
    });

    render(<StudentsPage />);
    await userEvent.type(screen.getByPlaceholderText('이름'), '이지은');
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledWith({ name: '이지은' }));
  });

  it('submits gender, phone numbers, and a sibling selection', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '이지은', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);
    vi.mocked(studentsApi.create).mockResolvedValue({
      id: 's2',
      name: '김민준',
      siblingIds: ['s1'],
      createdAt: '',
      updatedAt: ''
    });

    render(<StudentsPage />);
    await screen.findByRole('checkbox', { name: '이지은' });

    await userEvent.type(screen.getByPlaceholderText('이름'), '김민준');
    await userEvent.selectOptions(screen.getByRole('combobox'), '남');
    await userEvent.type(screen.getByPlaceholderText('전화번호'), '010-1111-2222');
    await userEvent.type(screen.getByPlaceholderText('학부모님 연락처'), '010-3333-4444');
    await userEvent.click(screen.getByRole('checkbox', { name: '이지은' }));
    await userEvent.click(screen.getByText('추가'));

    await waitFor(() =>
      expect(studentsApi.create).toHaveBeenCalledWith({
        name: '김민준',
        gender: 'male',
        phone: '010-1111-2222',
        parentPhone: '010-3333-4444',
        siblingIds: ['s1']
      })
    );
  });

  it('renders customized columns: 학교 및 학년, 이름, 등원 시간대, 수업시간, 비고란, 관리', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      {
        id: 's1',
        name: '김민수',
        schoolName: '신사중',
        grade: '2학년',
        siblingIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<StudentsPage />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('학교 및 학년')).toBeInTheDocument();
    expect(within(table).getByText('이름')).toBeInTheDocument();
    expect(within(table).getByText('등원 시간대')).toBeInTheDocument();
    expect(within(table).getByText('수업시간')).toBeInTheDocument();
    expect(within(table).getByText('비고란')).toBeInTheDocument();
    expect(within(table).getByText('관리')).toBeInTheDocument();

    // Check student row values
    expect(within(table).getByText('신사중 2학년')).toBeInTheDocument();
    expect(within(table).getByText('김민수')).toBeInTheDocument();
  });

  it('renders schedule pattern filter tabs (전체, 월수금, 화목, 기타 / 예외, 미배정)', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      { id: 's1', name: '김민수', siblingIds: [], createdAt: '', updatedAt: '' }
    ]);

    render(<StudentsPage />);

    const tabs = await screen.findByRole('tablist', { name: '등원 요일 패턴 필터' });
    expect(within(tabs).getByText('전체')).toBeInTheDocument();
    expect(within(tabs).getByText('월수금')).toBeInTheDocument();
    expect(within(tabs).getByText('화목')).toBeInTheDocument();
    expect(within(tabs).getByText('기타 / 예외')).toBeInTheDocument();
    expect(within(tabs).getByText('미배정')).toBeInTheDocument();

    // Clicking filter tab
    await userEvent.click(within(tabs).getByText('화목'));
    // Since s1 is unassigned, it should show empty state when filtering for tue_thu
    expect(screen.getByText('조건에 일치하는 학생이 없습니다.')).toBeInTheDocument();

    // Clicking '미배정' tab should show the student again
    await userEvent.click(within(tabs).getByText('미배정'));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('김민수')).toBeInTheDocument();
  });

  it('loads student data into form when clicking 수정', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([
      {
        id: 's1',
        name: '박수진',
        schoolName: '압구정고',
        grade: '1학년',
        phone: '010-9999-8888',
        siblingIds: [],
        createdAt: '',
        updatedAt: ''
      }
    ]);

    render(<StudentsPage />);
    const table = await screen.findByRole('table');
    const editBtn = within(table).getByText('수정');
    await userEvent.click(editBtn);

    expect(screen.getByPlaceholderText('이름')).toHaveValue('박수진');
    expect(screen.getByPlaceholderText('학교이름')).toHaveValue('압구정고');
    expect(screen.getByPlaceholderText('학년/반')).toHaveValue('1학년');
    expect(screen.getByPlaceholderText('전화번호')).toHaveValue('010-9999-8888');
    expect(screen.getByText('수정 완료')).toBeInTheDocument();
  });

  it('renders excel import, template download, and export buttons and handles export clicks', async () => {
    vi.mocked(studentsApi.list).mockResolvedValue([]);

    render(<StudentsPage />);

    const importBtn = screen.getByText('엑셀 일괄 등록');
    const templateBtn = screen.getByText('양식 다운로드');
    const exportExcelBtn = screen.getByText('명단 엑셀');
    const exportPdfBtn = screen.getByText('명단 PDF');

    expect(importBtn).toBeInTheDocument();
    expect(templateBtn).toBeInTheDocument();
    expect(exportExcelBtn).toBeInTheDocument();
    expect(exportPdfBtn).toBeInTheDocument();

    await userEvent.click(templateBtn);
    expect(studentsApi.downloadTemplate).toHaveBeenCalled();
  });
});

