-- ===========================================================================
-- seed 4) (선택) 리허설용 가상 구매 데이터 — 동점 상황 연습용
--
--   공개 범위/동점 처리를 교실에서 미리 연습해 보고 싶을 때만 실행하세요.
--   연습이 끝나면 반드시 관리자 화면의 "리허설 데이터 초기화"를 눌러 지우세요.
--
--   만들어지는 상황
--     1모둠 6장, 2모둠 6장  -> 공동 1위 (TOP 1 공개에서도 둘 다 공개)
--     3모둠 4장, 4모둠 4장  -> 공동 3위 (TOP 3 공개에서 둘 다 공개)
--     5모둠 1장
-- ===========================================================================

do $$
declare
  v_session uuid;
  v_ids uuid[];
  v_sub uuid;
  i int;
begin
  select id into v_session from public.class_sessions where slug = 'default';
  if v_session is null then
    raise exception 'default 세션이 없습니다. 01_session_and_products.sql 을 먼저 실행하세요.';
  end if;

  select array_agg(id order by group_no) into v_ids
    from public.travel_products where session_id = v_session;

  -- 학생 구매 (1모둠 5, 2모둠 5, 3모둠 3, 4모둠 3, 5모둠 1)
  for i in 1..5 loop
    insert into public.purchase_submissions (session_id, participant_type, review)
      values (v_session, 'student', '(리허설) 이 여행이 기대돼요 ' || i) returning id into v_sub;
    insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[1]);
  end loop;
  for i in 1..5 loop
    insert into public.purchase_submissions (session_id, participant_type, review)
      values (v_session, 'student', '(리허설) 꼭 가 보고 싶어요 ' || i) returning id into v_sub;
    insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[2]);
  end loop;
  for i in 1..3 loop
    insert into public.purchase_submissions (session_id, participant_type, review)
      values (v_session, 'student', '(리허설) 바다가 멋져 보여요 ' || i) returning id into v_sub;
    insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[3]);
  end loop;
  for i in 1..3 loop
    insert into public.purchase_submissions (session_id, participant_type, review)
      values (v_session, 'student', '(리허설) 자연이 궁금해요 ' || i) returning id into v_sub;
    insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[4]);
  end loop;
  insert into public.purchase_submissions (session_id, participant_type, review)
    values (v_session, 'student', '(리허설) 사막을 보고 싶어요') returning id into v_sub;
  insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[5]);

  -- 학부모 구매 (여행권 2장씩: 1+2모둠 1명, 3+4모둠 1명)
  insert into public.purchase_submissions (session_id, participant_type, review)
    values (v_session, 'parent', '(리허설) 두 나라 모두 가 보고 싶습니다') returning id into v_sub;
  insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[1]), (v_sub, v_ids[2]);

  insert into public.purchase_submissions (session_id, participant_type, review)
    values (v_session, 'parent', '(리허설) 아이와 함께 떠나고 싶어요') returning id into v_sub;
  insert into public.vote_choices (submission_id, product_id) values (v_sub, v_ids[3]), (v_sub, v_ids[4]);
end $$;
