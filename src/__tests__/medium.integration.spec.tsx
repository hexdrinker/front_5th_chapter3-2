import { ChakraProvider } from '@chakra-ui/react';
import { render, screen, within, act, renderHook } from '@testing-library/react';
import { UserEvent, userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ReactElement } from 'react';

import {
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerRepeatedEventCreation,
  setupMockHandlerRepeatedEventDeletion,
  setupMockHandlerUpdating,
} from '../__mocks__/handlersUtils';
import App from '../App';
import { useEventForm } from '../hooks/useEventForm';
import { useEventOperations } from '../hooks/useEventOperations';
import { server } from '../setupTests';
import { Event } from '../types';

// ! Hard 여기 제공 안함
const setup = (element: ReactElement) => {
  const user = userEvent.setup();

  return { ...render(<ChakraProvider>{element}</ChakraProvider>), user }; // ? Med: 왜 ChakraProvider로 감싸는지 물어보자
};

// ! Hard 여기 제공 안함
const saveSchedule = async (
  user: UserEvent,
  form: Omit<Event, 'id' | 'notificationTime' | 'repeat'>
) => {
  const { title, date, startTime, endTime, location, description, category } = form;

  await user.click(screen.getAllByText('일정 추가')[0]);

  await user.type(screen.getByLabelText('제목'), title);
  await user.type(screen.getByLabelText('날짜'), date);
  await user.type(screen.getByLabelText('시작 시간'), startTime);
  await user.type(screen.getByLabelText('종료 시간'), endTime);
  await user.type(screen.getByLabelText('설명'), description);
  await user.type(screen.getByLabelText('위치'), location);
  await user.selectOptions(screen.getByLabelText('카테고리'), category);

  await user.click(screen.getByTestId('event-submit-button'));
};

describe('일정 CRUD 및 기본 기능', () => {
  it('입력한 새로운 일정 정보에 맞춰 모든 필드가 이벤트 리스트에 정확히 저장된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '14:00',
      endTime: '15:00',
      description: '프로젝트 진행 상황 논의',
      location: '회의실 A',
      category: '업무',
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('새 회의')).toBeInTheDocument();
    expect(eventList.getByText('2025-10-15')).toBeInTheDocument();
    expect(eventList.getByText('14:00 - 15:00')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 진행 상황 논의')).toBeInTheDocument();
    expect(eventList.getByText('회의실 A')).toBeInTheDocument();
    expect(eventList.getByText('카테고리: 업무')).toBeInTheDocument();
  });

  it('기존 일정의 세부 정보를 수정하고 변경사항이 정확히 반영된다', async () => {
    const { user } = setup(<App />);

    setupMockHandlerUpdating();

    await user.click(await screen.findByLabelText('Edit event'));

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');
    await user.clear(screen.getByLabelText('설명'));
    await user.type(screen.getByLabelText('설명'), '회의 내용 변경');

    await user.click(screen.getByTestId('event-submit-button'));

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('수정된 회의')).toBeInTheDocument();
    expect(eventList.getByText('회의 내용 변경')).toBeInTheDocument();
  });

  it('일정을 삭제하고 더 이상 조회되지 않는지 확인한다', async () => {
    setupMockHandlerDeletion();

    const { user } = setup(<App />);
    const eventList = within(screen.getByTestId('event-list'));
    expect(await eventList.findByText('삭제할 이벤트')).toBeInTheDocument();

    // 삭제 버튼 클릭
    const allDeleteButton = await screen.findAllByLabelText('Delete event');
    await user.click(allDeleteButton[0]);

    expect(eventList.queryByText('삭제할 이벤트')).not.toBeInTheDocument();
  });
});

describe('일정 뷰', () => {
  it('주별 뷰를 선택 후 해당 주에 일정이 없으면, 일정이 표시되지 않는다.', async () => {
    // ! 현재 시스템 시간 2025-10-01
    const { user } = setup(<App />);

    await user.selectOptions(screen.getByLabelText('view'), 'week');

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('주별 뷰 선택 후 해당 일자에 일정이 존재한다면 해당 일정이 정확히 표시된다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    await saveSchedule(user, {
      title: '이번주 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번주 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
    });

    await user.selectOptions(screen.getByLabelText('view'), 'week');

    const weekView = within(screen.getByTestId('week-view'));
    expect(weekView.getByText('이번주 팀 회의')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 없으면, 일정이 표시되지 않아야 한다.', async () => {
    vi.setSystemTime(new Date('2025-01-01'));

    setup(<App />);

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 정확히 표시되는지 확인한다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    await saveSchedule(user, {
      title: '이번달 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번달 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
    });

    const monthView = within(screen.getByTestId('month-view'));
    expect(monthView.getByText('이번달 팀 회의')).toBeInTheDocument();
  });

  it('달력에 1월 1일(신정)이 공휴일로 표시되는지 확인한다', async () => {
    vi.setSystemTime(new Date('2025-01-01'));
    setup(<App />);

    const monthView = screen.getByTestId('month-view');

    // 1월 1일 셀 확인
    const januaryFirstCell = within(monthView).getByText('1').closest('td')!;
    expect(within(januaryFirstCell).getByText('신정')).toBeInTheDocument();
  });
});

describe('검색 기능', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/events', () => {
        return HttpResponse.json({
          events: [
            {
              id: 1,
              title: '팀 회의',
              date: '2025-10-15',
              startTime: '09:00',
              endTime: '10:00',
              description: '주간 팀 미팅',
              location: '회의실 A',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
            {
              id: 2,
              title: '프로젝트 계획',
              date: '2025-10-16',
              startTime: '14:00',
              endTime: '15:00',
              description: '새 프로젝트 계획 수립',
              location: '회의실 B',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
          ],
        });
      })
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('검색 결과가 없으면, "검색 결과가 없습니다."가 표시되어야 한다.', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '존재하지 않는 일정');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it("'팀 회의'를 검색하면 해당 제목을 가진 일정이 리스트에 노출된다", async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
  });

  it('검색어를 지우면 모든 일정이 다시 표시되어야 한다', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');
    await user.clear(searchInput);

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 계획')).toBeInTheDocument();
  });
});

describe('일정 충돌', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('겹치는 시간에 새 일정을 추가할 때 경고가 표시된다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-15',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 10,
      },
    ]);

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '09:30',
      endTime: '10:30',
      description: '설명',
      location: '회의실 A',
      category: '업무',
    });

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });

  it('기존 일정의 시간을 수정하여 충돌이 발생하면 경고가 노출된다', async () => {
    setupMockHandlerUpdating();

    const { user } = setup(<App />);

    const editButton = (await screen.findAllByLabelText('Edit event'))[1];
    await user.click(editButton);

    // 시간 수정하여 다른 일정과 충돌 발생
    await user.clear(screen.getByLabelText('시작 시간'));
    await user.type(screen.getByLabelText('시작 시간'), '08:30');
    await user.clear(screen.getByLabelText('종료 시간'));
    await user.type(screen.getByLabelText('종료 시간'), '10:30');

    await user.click(screen.getByTestId('event-submit-button'));

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });
});

it('notificationTime을 10으로 하면 지정 시간 10분 전 알람 텍스트가 노출된다', async () => {
  vi.setSystemTime(new Date('2025-10-15 08:49:59'));

  setup(<App />);

  // ! 일정 로딩 완료 후 테스트
  await screen.findByText('일정 로딩 완료!');

  expect(screen.queryByText('10분 후 기존 회의 일정이 시작됩니다.')).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByText('10분 후 기존 회의 일정이 시작됩니다.')).toBeInTheDocument();
});

describe('반복 일정 추가', () => {
  it('반복 유형을 매일로 선택하면 매일 반복되는 일정이 생성된다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '발제 과제하기,,,힘내',
      date: '2025-05-18',
      startTime: '13:00',
      endTime: '18:00',
      description: '과제는 매일 하는 거다 이녀석아',
      location: '우리집',
      category: '개인',
      repeat: { type: 'daily', interval: 1, endDate: '2025-05-22' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(5);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2025-05-19',
      },
      {
        ...newEvent,
        id: '3',
        date: '2025-05-20',
      },
      {
        ...newEvent,
        id: '4',
        date: '2025-05-21',
      },
      {
        ...newEvent,
        id: '5',
        date: '2025-05-22',
      },
    ]);
  });

  it('반복 유형을 매주로 선택하면 매주 반복되는 일정이 생성된다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '발제',
      date: '2025-05-17',
      startTime: '13:00',
      endTime: '18:00',
      description: '앞으로 남은 발제들,,',
      location: '우리집',
      category: '개인',
      repeat: { type: 'weekly', interval: 1, endDate: '2025-06-06' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(3);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2025-05-24',
      },
      {
        ...newEvent,
        id: '3',
        date: '2025-05-31',
      },
    ]);
  });

  it('반복 유형을 매월로 선택하고 간격을 3으로 하면 세 달마다 반복되는 일정이 생성된다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '병원 정기 검진',
      date: '2025-05-01',
      startTime: '13:00',
      endTime: '18:00',
      description: '경희대병원',
      location: '병원',
      category: '개인',
      repeat: { type: 'monthly', interval: 3, endDate: '2026-03-01' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(4);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2025-08-01',
      },
      {
        ...newEvent,
        id: '3',
        date: '2025-11-01',
      },
      {
        ...newEvent,
        id: '4',
        date: '2026-02-01',
      },
    ]);
  });

  it('반복 유형을 매년으로 선택하고 간격을 2로 하면 격년 반복되는 일정이 생성된다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '격년 크리스마스',
      date: '2024-12-25',
      startTime: '13:00',
      endTime: '18:00',
      description: '크리수마스 파뤼',
      location: '우리집',
      category: '개인',
      repeat: { type: 'yearly', interval: 2, endDate: '2030-12-31' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(4);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2026-12-25',
      },
      {
        ...newEvent,
        id: '3',
        date: '2028-12-25',
      },
      {
        ...newEvent,
        id: '4',
        date: '2030-12-25',
      },
    ]);
  });

  it('31일에 매월 반복되는 일정을 생성하면 30일이 마지막인 달에는 일정이 등록되지 않는다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '31일은 베라데이',
      date: '2025-05-31',
      startTime: '13:00',
      endTime: '18:00',
      description: '베라데이',
      location: '우리집',
      category: '개인',
      repeat: { type: 'monthly', interval: 1, endDate: '2025-10-01' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(3);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2025-07-31',
      },
      {
        ...newEvent,
        id: '3',
        date: '2025-08-31',
      },
    ]);
  });

  it('2월 29일에 매년 반복되는 일정을 생성하면 평년에는 일정이 생성되지 않는다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '윤년',
      date: '2024-02-29',
      startTime: '13:00',
      endTime: '18:00',
      description: '윤년',
      location: '우리집',
      category: '개인',
      repeat: { type: 'yearly', interval: 1, endDate: '2032-03-01' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(3);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2028-02-29',
      },
      {
        ...newEvent,
        id: '3',
        date: '2032-02-29',
      },
    ]);
  });
});

describe('반복 일정 수정', () => {
  it('반복 일정 중 하나를 수정하면 반복 아이콘이 사라지며 단일 일정으로 변경된다.', async () => {
    const singleEvent: Event = {
      id: 'single-event',
      title: '단일 이벤트',
      date: '2025-10-01',
      startTime: '09:00',
      endTime: '12:00',
      description: '이것은 단일 이벤트.',
      location: '회사',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 10,
    };

    const repeatedEventBase: Omit<Event, 'id' | 'date'> = {
      title: '테스트',
      startTime: '14:00',
      endTime: '15:00',
      description: '설명',
      location: '위치',
      category: '개인',
      repeat: {
        type: 'weekly',
        interval: 1,
        endDate: '2025-08-20',
        id: 'repeat-id',
      },
      notificationTime: 15,
    };

    const initialRepeatedEvents: Event[] = [
      { ...repeatedEventBase, id: '1', date: '2025-08-01' },
      { ...repeatedEventBase, id: '2', date: '2025-08-08' },
      { ...repeatedEventBase, id: '3', date: '2025-08-15' },
    ];

    let mockEvents: Event[] = [singleEvent, ...initialRepeatedEvents];

    const targetEvent = mockEvents.find((event) => event.id === '1');

    const { result } = renderHook(() => useEventForm());
    const { result: result2 } = renderHook(() => useEventOperations(true));

    const updatedEvent = {
      ...targetEvent,
      title: '단일 일정이 되어버린 테스트',
      description: '단일 일정이 되어버린 테스트 설명',
      repeat: { type: 'none', interval: 0 },
    };

    act(() => {
      result.current.editEvent(updatedEvent as Event);
      result2.current.saveEvent(updatedEvent as Event);
    });

    expect(result.current.title).toBe('단일 일정이 되어버린 테스트');
    expect(result.current.description).toBe('단일 일정이 되어버린 테스트 설명');
    expect(result.current.isRepeating).toBe(false);
    expect(result.current.repeatType).toBe('none');
  });
});

describe('반복 일정 삭제', () => {
  it('반복 일정 중 단일 일정을 삭제하면 해당 일정만 삭제되고 나머지는 유지된다.', async () => {
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const initialEvents: Event[] = [
      {
        id: '1',
        title: '매월 반복',
        date: '2025-07-01',
        startTime: '10:00',
        endTime: '11:00',
        description: '월간 보고',
        location: '본사',
        category: '업무',
        repeat: { type: 'monthly', interval: 1, endDate: '2025-09-01', id: 'repeat-id' },
        notificationTime: 60,
      },
      {
        id: '2',
        title: '매월 반복',
        date: '2025-08-01',
        startTime: '10:00',
        endTime: '11:00',
        description: '월간 보고',
        location: '본사',
        category: '업무',
        repeat: { type: 'monthly', interval: 1, endDate: '2025-09-01', id: 'repeat-id' },
        notificationTime: 60,
      },
      {
        id: '3',
        title: '매월 반복',
        date: '2025-09-01',
        startTime: '10:00',
        endTime: '11:00',
        description: '월간 보고',
        location: '본사',
        category: '업무',
        repeat: { type: 'monthly', interval: 1, endDate: '2025-09-01', id: 'repeat-id' },
        notificationTime: 60,
      },
    ];

    let mockEventsData = [...initialEvents];

    server.use(
      http.get('/api/events', () => HttpResponse.json({ events: mockEventsData })),
      http.delete('/api/events/:id', ({ params }) => {
        const { id } = params;
        mockEventsData = mockEventsData.filter((event) => event.id !== id);
        return new HttpResponse(null, { status: 204 });
      })
    );

    await act(async () => {
      await result.current.deleteEvent('2');
    });
    await act(() => Promise.resolve(null));

    expect(result.current.events.find((e) => e.id === '2')).toBeUndefined();
    expect(result.current.events.find((e) => e.id === '1')).toBeDefined();
    expect(result.current.events.find((e) => e.id === '3')).toBeDefined();
    expect(result.current.events.filter((e) => e.repeat.id === 'repeat-id')).toHaveLength(2);
    expect(result.current.events).toHaveLength(2);
  });
  it('반복 일정 전체 삭제를 하면 모든 반복 일정이 삭제된다.', async () => {
    setupMockHandlerRepeatedEventDeletion();

    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    await act(async () => {
      await result.current.deleteAllRepeatedEvents('repeat-id');
    });

    await act(() => Promise.resolve(null));

    const keptEvent = result.current.events.find((e) => e.id === '4');
    expect(keptEvent).toBeDefined();
    expect(result.current.events).toHaveLength(1);
  });
});

describe('반복 일정 종료', () => {
  it('특정 횟수를 지정하면 횟수만큼 반복된 일정을 생성한다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '발제 과제하기,,,힘내',
      date: '2025-05-18',
      startTime: '13:00',
      endTime: '18:00',
      description: '과제는 매일 하는 거다 이녀석아',
      location: '우리집',
      category: '개인',
      repeat: { type: 'daily', interval: 1, endDate: '2025-05-22' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent, 3);
    });

    expect(result.current.events).toHaveLength(3);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2025-05-19',
      },
      {
        ...newEvent,
        id: '3',
        date: '2025-05-20',
      },
    ]);
  });

  it('종료 일자를 지정하지 않으면 기본 종료 일자(2025년 9월 30일)까지의 반복된 일정을 생성한다.', async () => {
    setupMockHandlerRepeatedEventCreation();
    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const newEvent: Event = {
      id: '1',
      title: '병원 정기 검진',
      date: '2025-05-01',
      startTime: '13:00',
      endTime: '18:00',
      description: '경희대병원',
      location: '병원',
      category: '개인',
      repeat: { type: 'monthly', interval: 2 },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveRepeatedEvents(newEvent);
    });

    expect(result.current.events).toHaveLength(3);

    expect(result.current.events).toEqual([
      {
        ...newEvent,
      },
      {
        ...newEvent,
        id: '2',
        date: '2025-07-01',
      },
      {
        ...newEvent,
        id: '3',
        date: '2025-09-01',
      },
    ]);
  });
});
