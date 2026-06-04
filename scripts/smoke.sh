#!/usr/bin/env bash
# Smoke test all the routes I shipped this session.
# Key curl rule: never use -X POST with -L. Let --data-urlencode imply POST
# so 302 redirects properly downgrade to GET.

set -u
BASE="http://localhost:5173"
PASS=0
FAIL=0
WARN=0
FAILURES=()

T=$(date +%s)
OWNER_EMAIL="owner+${T}@test.dev"
INST_EMAIL="inst+${T}@test.dev"
PARENT_EMAIL="parent+${T}@test.dev"
STUDENT_EMAIL="student+${T}@test.dev"
PASSWORD="testpassword123"

OWNER_J=/tmp/cj.owner
INST_J=/tmp/cj.inst
PARENT_J=/tmp/cj.parent
ANON_J=/tmp/cj.anon
> $OWNER_J; > $INST_J; > $PARENT_J; > $ANON_J

color() { printf "\033[%sm%s\033[0m" "$1" "$2"; }
ok()    { PASS=$((PASS+1)); printf "  %s  %s\n" "$(color '0;32' '✓')" "$1"; }
bad()   { FAIL=$((FAIL+1)); FAILURES+=("$1"); printf "  %s  %s\n" "$(color '0;31' '✗')" "$1"; }
warn()  { WARN=$((WARN+1)); printf "  %s  %s\n" "$(color '0;33' '!')" "$1"; }
section() { printf "\n%s\n" "$(color '1;36' "── $1 ─────────────────")"; }

# GET with cookie jar; check status + optional body marker.
check_get() {
  local label="$1" expected_status="$2" url="$3" jar="$4" marker="${5:-}"
  local resp=$(curl -sS -L -b "$jar" -c "$jar" \
    -w "\n__STATUS=%{http_code}\n__URL=%{url_effective}\n" "$url")
  local status=$(echo "$resp" | grep -oE '^__STATUS=[0-9]+' | tail -1 | sed 's/__STATUS=//')
  local final=$(echo "$resp" | grep -oE '^__URL=.+' | tail -1 | sed 's/__URL=//')
  local body=$(echo "$resp" | sed '/^__STATUS=/d; /^__URL=/d')
  if [ "$status" != "$expected_status" ]; then
    bad "$label — expected $expected_status got $status (final=$final)"
    return 1
  fi
  if [ -n "$marker" ] && ! echo "$body" | grep -qiF "$marker"; then
    bad "$label — status ok but missing marker '$marker'"
    return 1
  fi
  ok "$label [$status]"
}

# POST a form (no -X POST so 302 follows as GET).
# Returns the final HTTP status to stdout.
post_form() {
  local jar="$1" url="$2"; shift 2
  local args=()
  for kv in "$@"; do args+=("--data-urlencode" "$kv"); done
  curl -sS -L -b "$jar" -c "$jar" \
    "${args[@]}" \
    -o /dev/null -w "%{http_code} %{url_effective}" "$url"
}

post_form_marker() {
  local jar="$1" url="$2" marker="$3"; shift 3
  local args=()
  for kv in "$@"; do args+=("--data-urlencode" "$kv"); done
  local resp=$(curl -sS -L -b "$jar" -c "$jar" "${args[@]}" \
    -w "\n__STATUS=%{http_code}\n__URL=%{url_effective}\n" "$url")
  local status=$(echo "$resp" | grep -oE '^__STATUS=[0-9]+' | tail -1 | sed 's/__STATUS=//')
  local body=$(echo "$resp" | sed '/^__STATUS=/d; /^__URL=/d')
  echo "$status"
  echo "$body" | grep -qiF "$marker" && echo "MARKER_OK" || echo "MARKER_MISSING"
}

signup() {
  local email="$1" name="$2" jar="$3"
  local result=$(curl -sS -L -b "$jar" -c "$jar" \
    --data-urlencode "email=$email" \
    --data-urlencode "password=$PASSWORD" \
    --data-urlencode "name=$name" \
    -o /dev/null -w "%{http_code} %{url_effective}" \
    "$BASE/signup")
  local status=${result%% *}
  local final=${result#* }
  if [ "$status" = "200" ]; then
    ok "signup $email → $final"
    return 0
  else
    bad "signup $email failed ($status, $final)"
    return 1
  fi
}

D1() {
  npx wrangler d1 execute directio-dev --local --command "$1" --json 2>/dev/null | sed -n '/^\[/,$p'
}

# Get a single column from D1 query (first row).
D1_one() {
  D1 "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['results'][0].get('$2','') if d and d[0]['results'] else '')" 2>/dev/null
}

D1_count() {
  D1 "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['results'][0].get('n',0) if d and d[0]['results'] else 0)" 2>/dev/null
}

section "Sign up owner"
signup "$OWNER_EMAIL" "Owner Test" "$OWNER_J" || exit 1

section "Owner: create school"
SCHOOL_NAME="Smoke School $T"
ON_OUT=$(post_form "$OWNER_J" "$BASE/onboarding" "name=$SCHOOL_NAME")
echo "  onboard result: $ON_OUT"
if [[ "$ON_OUT" =~ ^200 ]]; then
  ok "onboarding create-org"
else
  bad "onboarding create-org → $ON_OUT"
fi

ORG_ID=$(D1_one "SELECT id FROM organization WHERE name='$SCHOOL_NAME'" "id")
echo "  org id: $ORG_ID"
[ -n "$ORG_ID" ] && ok "org row exists" || bad "org row missing"

# Seed a program + package so we can test enrollments and certs.
PROG_ID="prog_$T"
PKG_ID="pkg_$T"
D1 "INSERT INTO program (id, organizationId, slug, name, kind, active, createdAt, updatedAt) VALUES ('$PROG_ID', '$ORG_ID', 'teen', 'Teen', 'teen', 1, ${T}000, ${T}000)" > /dev/null
D1 "INSERT INTO programPackage (id, organizationId, programId, name, priceCents, currency, btwLessonCount, active, createdAt, updatedAt) VALUES ('$PKG_ID', '$ORG_ID', '$PROG_ID', 'Standard', 50000, 'USD', 6, 1, ${T}000, ${T}000)" > /dev/null
ok "program + package seeded"

section "Admin dashboard + every nav route"
check_get "GET /admin"                       200 "$BASE/admin" "$OWNER_J" "Welcome back"
check_get "GET /admin/students"              200 "$BASE/admin/students" "$OWNER_J"
check_get "GET /admin/schedule"              200 "$BASE/admin/schedule" "$OWNER_J" "Next 7 days"
check_get "GET /admin/schedule/new"          200 "$BASE/admin/schedule/new" "$OWNER_J" "Book a lesson"
check_get "GET /admin/instructors"           200 "$BASE/admin/instructors" "$OWNER_J"
check_get "GET /admin/vehicles"              200 "$BASE/admin/vehicles" "$OWNER_J"
check_get "GET /admin/programs"              200 "$BASE/admin/programs" "$OWNER_J"
check_get "GET /admin/library"               200 "$BASE/admin/library" "$OWNER_J"
check_get "GET /admin/reports/quizzes"       200 "$BASE/admin/reports/quizzes" "$OWNER_J" "Quiz"
check_get "GET /admin/documents"             200 "$BASE/admin/documents" "$OWNER_J" "Documents"
check_get "GET /admin/fees"                  200 "$BASE/admin/fees" "$OWNER_J" "Cancellation"
check_get "GET /admin/road-tests"            200 "$BASE/admin/road-tests" "$OWNER_J" "Road test outcomes"
check_get "GET /admin/payments"              200 "$BASE/admin/payments" "$OWNER_J"
check_get "GET /admin/settings"              200 "$BASE/admin/settings" "$OWNER_J"
check_get "GET /admin/settings/cancellation" 200 "$BASE/admin/settings/cancellation" "$OWNER_J" "Cancellation"
check_get "GET /admin/settings/btw-flow"     200 "$BASE/admin/settings/btw-flow" "$OWNER_J"
check_get "GET /admin/settings/public-listing" 200 "$BASE/admin/settings/public-listing" "$OWNER_J"

section "Cancellation policy: save + persist"
SAVE_OUT=$(post_form "$OWNER_J" "$BASE/admin/settings/cancellation" \
  "cancellationDeadlineHours=12" \
  "lateCancelFeeDollars=25" \
  "noShowFeeDollars=50" \
  "allowFamilyReschedule=on")
if [[ "$SAVE_OUT" =~ ^200 ]]; then
  ok "POST /admin/settings/cancellation"
else
  bad "POST /admin/settings/cancellation → $SAVE_OUT"
fi
DLH=$(D1_one "SELECT cancellationDeadlineHours FROM organization WHERE id='$ORG_ID'" "cancellationDeadlineHours")
LCF=$(D1_one "SELECT lateCancelFeeCents FROM organization WHERE id='$ORG_ID'" "lateCancelFeeCents")
NSF=$(D1_one "SELECT noShowFeeCents FROM organization WHERE id='$ORG_ID'" "noShowFeeCents")
echo "  policy: deadline=${DLH}h lateCancel=${LCF}c noShow=${NSF}c"
[ "$DLH" = "12" ] && [ "$LCF" = "2500" ] && [ "$NSF" = "5000" ] \
  && ok "policy persisted correctly" \
  || bad "policy did NOT persist correctly"

section "Owner accessing /family should redirect"
F_RESULT=$(curl -sS -L -b "$OWNER_J" -c "$OWNER_J" -o /dev/null \
  -w "%{http_code} %{url_effective}" "$BASE/family")
echo "  /family as owner: $F_RESULT"
[[ "$F_RESULT" == *"/admin"* ]] && ok "owner redirected to /admin" \
  || bad "owner not redirected"

section "Sign up parent + link to a kid"
signup "$PARENT_EMAIL" "Parent Test" "$PARENT_J" || true
PARENT_USER_ID=$(D1_one "SELECT id FROM user WHERE email='$PARENT_EMAIL'" "id")
echo "  parent user: $PARENT_USER_ID"

STUDENT_ID="stu_$T"
GUARDIAN_ID="gua_$T"
ENROLLMENT_ID="enr_$T"
D1 "INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES ('mem_$T', '$ORG_ID', '$PARENT_USER_ID', 'parent', ${T}000)" >/dev/null
D1 "INSERT INTO student (id, organizationId, firstName, lastName, email, createdAt, updatedAt) VALUES ('$STUDENT_ID', '$ORG_ID', 'Kid', 'Tester', '$STUDENT_EMAIL', ${T}000, ${T}000)" >/dev/null
D1 "INSERT INTO guardian (id, organizationId, userId, firstName, lastName, createdAt) VALUES ('$GUARDIAN_ID', '$ORG_ID', '$PARENT_USER_ID', 'Parent', 'Tester', ${T}000)" >/dev/null
D1 "INSERT INTO guardianStudent (guardianId, studentId, createdAt) VALUES ('$GUARDIAN_ID', '$STUDENT_ID', ${T}000)" >/dev/null
D1 "INSERT INTO enrollment (id, organizationId, studentId, programId, programPackageId, status, journeyState, enrolledAt, createdAt, updatedAt) VALUES ('$ENROLLMENT_ID', '$ORG_ID', '$STUDENT_ID', '$PROG_ID', '$PKG_ID', 'active', 'btw', ${T}000, ${T}000, ${T}000)" >/dev/null
# Sanity check the seeds actually landed
ENR_OK=$(D1_count "SELECT COUNT(*) AS n FROM enrollment WHERE id='$ENROLLMENT_ID'")
[ "$ENR_OK" = "1" ] && ok "enrollment row exists" || bad "enrollment did NOT insert"

section "Family screens"
check_get "GET /family"           200 "$BASE/family" "$PARENT_J" "Hi"
check_get "GET /family/lessons"   200 "$BASE/family/lessons" "$PARENT_J" "Lessons"
check_get "GET /family/payments"  200 "$BASE/family/payments" "$PARENT_J"
check_get "GET /family/documents" 200 "$BASE/family/documents" "$PARENT_J"
check_get "GET /family/certificate/:id" 200 "$BASE/family/certificate/$ENROLLMENT_ID" "$PARENT_J" "Certificate"

section "Family: cancel a far-future lesson (no fee)"
APPT_ID="apt_$T"
STARTS=$(( T * 1000 + 3 * 86400000 ))
ENDS=$(( STARTS + 3600000 ))
D1 "INSERT INTO appointment (id, organizationId, enrollmentId, kind, status, startsAt, endsAt, createdAt, updatedAt, feeAssessedCents) VALUES ('$APPT_ID', '$ORG_ID', '$ENROLLMENT_ID', 'btw', 'scheduled', $STARTS, $ENDS, ${T}000, ${T}000, 0)" >/dev/null
CANCEL_OUT=$(post_form "$PARENT_J" "$BASE/family/lessons" \
  "intent=cancel" "appointmentId=$APPT_ID")
echo "  cancel result: $CANCEL_OUT"
A_STATUS=$(D1_one "SELECT status FROM appointment WHERE id='$APPT_ID'" "status")
A_FEE=$(D1_one "SELECT feeAssessedCents FROM appointment WHERE id='$APPT_ID'" "feeAssessedCents")
echo "  appt: status=$A_STATUS fee=$A_FEE"
[ "$A_STATUS" = "canceled" ] && ok "far cancel: status flipped" || bad "far cancel: status not flipped"
[ "$A_FEE" = "0" ] && ok "far cancel: no fee" || bad "far cancel: unexpected fee $A_FEE"

section "Family: cancel a 4-hours-out lesson (\$25 fee)"
APPT2="apt2_$T"
STARTS2=$(( T * 1000 + 4 * 3600000 ))
ENDS2=$(( STARTS2 + 3600000 ))
D1 "INSERT INTO appointment (id, organizationId, enrollmentId, kind, status, startsAt, endsAt, createdAt, updatedAt, feeAssessedCents) VALUES ('$APPT2', '$ORG_ID', '$ENROLLMENT_ID', 'btw', 'scheduled', $STARTS2, $ENDS2, ${T}000, ${T}000, 0)" >/dev/null
CANCEL2_OUT=$(post_form "$PARENT_J" "$BASE/family/lessons" \
  "intent=cancel" "appointmentId=$APPT2")
echo "  cancel result: $CANCEL2_OUT"
A2_FEE=$(D1_one "SELECT feeAssessedCents FROM appointment WHERE id='$APPT2'" "feeAssessedCents")
A2_REASON=$(D1_one "SELECT feeReason FROM appointment WHERE id='$APPT2'" "feeReason")
A2_FEESTATUS=$(D1_one "SELECT feeStatus FROM appointment WHERE id='$APPT2'" "feeStatus")
echo "  appt: fee=$A2_FEE reason=$A2_REASON status=$A2_FEESTATUS"
[ "$A2_FEE" = "2500" ] && ok "late cancel: \$25 assessed" || bad "late cancel: unexpected fee $A2_FEE"
[ "$A2_REASON" = "late_cancel" ] && ok "late cancel: reason set" || bad "late cancel: reason=$A2_REASON"

section "Admin /admin/fees shows the assessed fee"
RESP=$(curl -sS -L -b "$OWNER_J" "$BASE/admin/fees")
echo "$RESP" | grep -qF "25.00" && ok "/admin/fees shows \$25.00" || warn "/admin/fees doesn't show \$25.00"
# Mark paid
post_form "$OWNER_J" "$BASE/admin/fees" "intent=mark-paid" "appointmentId=$APPT2" > /dev/null
A2_FS=$(D1_one "SELECT feeStatus FROM appointment WHERE id='$APPT2'" "feeStatus")
[ "$A2_FS" = "paid" ] && ok "fee marked paid" || bad "fee status after mark-paid = $A2_FS"

section "Admin: log a road test (pass)"
TODAY=$(date +%Y-%m-%d)
RT_OUT=$(post_form "$OWNER_J" "$BASE/admin/road-tests" \
  "intent=log" "enrollmentId=$ENROLLMENT_ID" "attemptedOn=$TODAY" \
  "passed=on" "testingCenter=Test DMV" "examinerNotes=All good")
echo "  log result: $RT_OUT"
RT_COUNT=$(D1_count "SELECT COUNT(*) AS n FROM road_test_outcome WHERE enrollmentId='$ENROLLMENT_ID'")
echo "  outcomes count: $RT_COUNT"
[ "$RT_COUNT" = "1" ] && ok "road test logged" || bad "road test not logged ($RT_COUNT)"
JS=$(D1_one "SELECT journeyState FROM enrollment WHERE id='$ENROLLMENT_ID'" "journeyState")
[ "$JS" = "complete" ] && ok "journey advanced to complete on pass" \
  || warn "journey state after pass = $JS (expected 'complete')"

section "Admin: issue completion certificate"
ISSUE_OUT=$(post_form "$OWNER_J" "$BASE/family/certificate/$ENROLLMENT_ID" "intent=issue")
echo "  issue result: $ISSUE_OUT"
SERIAL=$(D1_one "SELECT completionCertSerial FROM enrollment WHERE id='$ENROLLMENT_ID'" "completionCertSerial")
echo "  cert serial: $SERIAL"
[[ "$SERIAL" =~ ^DIR- ]] && ok "certificate issued ($SERIAL)" || bad "certificate not issued"
# Family sees it
RESP=$(curl -sS -L -b "$PARENT_J" "$BASE/family/certificate/$ENROLLMENT_ID")
echo "$RESP" | grep -qF "Certificate of Completion" \
  && ok "family sees issued certificate" \
  || warn "family does not see expected text"

section "Sign up instructor (with pre-seeded instructor row)"
INST_ID="inst_$T"
D1 "INSERT INTO instructor (id, organizationId, firstName, lastName, email, active, createdAt) VALUES ('$INST_ID', '$ORG_ID', 'Test', 'Instr', '$INST_EMAIL', 1, ${T}000)" >/dev/null
INST_INS=$(D1_count "SELECT COUNT(*) AS n FROM instructor WHERE id='$INST_ID'")
[ "$INST_INS" = "1" ] && ok "instructor row exists" || bad "instructor did NOT insert"
signup "$INST_EMAIL" "Test Instr" "$INST_J" || true
ROLE=$(D1_one "SELECT role FROM member WHERE userId=(SELECT id FROM user WHERE email='$INST_EMAIL') AND organizationId='$ORG_ID'" "role")
echo "  instructor role: $ROLE"

check_get "GET /instructor"              200 "$BASE/instructor" "$INST_J" "schedule"
check_get "GET /instructor/upcoming"     200 "$BASE/instructor/upcoming" "$INST_J"
check_get "GET /instructor/past"         200 "$BASE/instructor/past" "$INST_J"
check_get "GET /instructor/availability" 200 "$BASE/instructor/availability" "$INST_J" "you can teach"
check_get "GET /instructor/practice-log" 200 "$BASE/instructor/practice-log" "$INST_J" "Parent practice log"

section "Instructor: add availability window"
START_W=$(date -d "+1 day 09:00" +%Y-%m-%dT%H:%M)
END_W=$(date -d "+1 day 17:00" +%Y-%m-%dT%H:%M)
WIN_OUT=$(post_form "$INST_J" "$BASE/instructor/availability" \
  "intent=add-window" "startsAt=$START_W" "endsAt=$END_W")
echo "  add-window: $WIN_OUT"
W_COUNT=$(D1_count "SELECT COUNT(*) AS n FROM instructorAvailability WHERE instructorId='$INST_ID'")
[ "$W_COUNT" -gt "0" ] && ok "availability window saved ($W_COUNT)" || bad "availability window not saved"

section "Admin: book inside window then double-book attempt"
BOOK_TIME=$(date -d "+1 day 10:00" +%Y-%m-%dT%H:%M)
B1_OUT=$(post_form "$OWNER_J" "$BASE/admin/schedule/new" \
  "enrollmentId=$ENROLLMENT_ID" \
  "instructorId=$INST_ID" \
  "kind=btw" \
  "startsAt=$BOOK_TIME" \
  "durationMin=60")
echo "  book inside window: $B1_OUT"
APPT_BOOKED=$(D1_one "SELECT id FROM appointment WHERE instructorId='$INST_ID' ORDER BY createdAt DESC LIMIT 1" "id")
echo "  booked appt id: $APPT_BOOKED"
[ -n "$APPT_BOOKED" ] && ok "first booking succeeded" || bad "first booking failed"

# Double-book at same time → should be blocked
B2_OUT=$(post_form "$OWNER_J" "$BASE/admin/schedule/new" \
  "enrollmentId=$ENROLLMENT_ID" \
  "instructorId=$INST_ID" \
  "kind=btw" \
  "startsAt=$BOOK_TIME" \
  "durationMin=60")
echo "  double-book attempt: $B2_OUT"
BOOK_COUNT=$(D1_count "SELECT COUNT(*) AS n FROM appointment WHERE instructorId='$INST_ID' AND startsAt=$(date -d "$BOOK_TIME" +%s)000")
echo "  appt count at slot: $BOOK_COUNT"
[ "$BOOK_COUNT" = "1" ] && ok "double-book blocked (1 appt at slot)" \
  || bad "double-book NOT blocked ($BOOK_COUNT appts)"

# Book outside availability without override → should be blocked (soft)
OUTSIDE_TIME=$(date -d "+2 day 03:00" +%Y-%m-%dT%H:%M)
B3_OUT=$(post_form "$OWNER_J" "$BASE/admin/schedule/new" \
  "enrollmentId=$ENROLLMENT_ID" \
  "instructorId=$INST_ID" \
  "kind=btw" \
  "startsAt=$OUTSIDE_TIME" \
  "durationMin=60")
echo "  outside-window attempt (no override): $B3_OUT"
OUTSIDE_COUNT=$(D1_count "SELECT COUNT(*) AS n FROM appointment WHERE instructorId='$INST_ID' AND startsAt=$(date -d "$OUTSIDE_TIME" +%s)000")
[ "$OUTSIDE_COUNT" = "0" ] && ok "outside-window blocked (no override)" \
  || bad "outside-window NOT blocked ($OUTSIDE_COUNT)"

# With override → should succeed
B4_OUT=$(post_form "$OWNER_J" "$BASE/admin/schedule/new" \
  "enrollmentId=$ENROLLMENT_ID" \
  "instructorId=$INST_ID" \
  "kind=btw" \
  "startsAt=$OUTSIDE_TIME" \
  "durationMin=60" \
  "overrideWindow=on")
OUTSIDE_COUNT2=$(D1_count "SELECT COUNT(*) AS n FROM appointment WHERE instructorId='$INST_ID' AND startsAt=$(date -d "$OUTSIDE_TIME" +%s)000")
[ "$OUTSIDE_COUNT2" = "1" ] && ok "outside-window allowed WITH override" \
  || bad "override didn't work ($OUTSIDE_COUNT2)"

section "Instructor: complete + no-show flows"
# Create a past appt for completion
PAST_APPT="pst_$T"
PAST_START=$(( T * 1000 - 3600000 ))
PAST_END=$(( T * 1000 ))
D1 "INSERT INTO appointment (id, organizationId, enrollmentId, instructorId, kind, status, startsAt, endsAt, createdAt, updatedAt, feeAssessedCents) VALUES ('$PAST_APPT', '$ORG_ID', '$ENROLLMENT_ID', '$INST_ID', 'btw', 'scheduled', $PAST_START, $PAST_END, ${T}000, ${T}000, 0)" >/dev/null

# Mark complete with next-focus. Index routes need ?index for action POSTs.
C_OUT=$(post_form "$INST_J" "$BASE/instructor?index" \
  "intent=complete" "appointmentId=$PAST_APPT" \
  "completionStatus=completed" \
  "notes=Worked on parallel parking." \
  "nextLessonFocus=Highway merging.")
echo "  complete: $C_OUT"
PA_STATUS=$(D1_one "SELECT status FROM appointment WHERE id='$PAST_APPT'" "status")
PA_FOCUS=$(D1_one "SELECT nextLessonFocus FROM appointment WHERE id='$PAST_APPT'" "nextLessonFocus")
[ "$PA_STATUS" = "completed" ] && ok "appt marked completed" || bad "appt not completed ($PA_STATUS)"
[ "$PA_FOCUS" = "Highway merging." ] && ok "nextLessonFocus saved" || bad "focus not saved ($PA_FOCUS)"

# Create another and mark no-show → fee
NS_APPT="ns_$T"
NS_START=$(( T * 1000 - 7200000 ))
NS_END=$(( T * 1000 - 3600000 ))
D1 "INSERT INTO appointment (id, organizationId, enrollmentId, instructorId, kind, status, startsAt, endsAt, createdAt, updatedAt, feeAssessedCents) VALUES ('$NS_APPT', '$ORG_ID', '$ENROLLMENT_ID', '$INST_ID', 'btw', 'scheduled', $NS_START, $NS_END, ${T}000, ${T}000, 0)" >/dev/null
post_form "$INST_J" "$BASE/instructor?index" \
  "intent=complete" "appointmentId=$NS_APPT" "completionStatus=no_show" > /dev/null
NS_STATUS=$(D1_one "SELECT status FROM appointment WHERE id='$NS_APPT'" "status")
NS_FEE=$(D1_one "SELECT feeAssessedCents FROM appointment WHERE id='$NS_APPT'" "feeAssessedCents")
NS_REASON=$(D1_one "SELECT feeReason FROM appointment WHERE id='$NS_APPT'" "feeReason")
echo "  no-show: status=$NS_STATUS fee=$NS_FEE reason=$NS_REASON"
[ "$NS_STATUS" = "no_show" ] && ok "no-show status set" || bad "no-show status = $NS_STATUS"
[ "$NS_FEE" = "5000" ] && ok "no-show fee = \$50" || bad "no-show fee = $NS_FEE"
[ "$NS_REASON" = "no_show" ] && ok "no-show reason set" || bad "no-show reason = $NS_REASON"

section "Documents review queue"
SDOC="sdoc_$T"
D1 "INSERT INTO signed_document (id, organizationId, studentId, kind, status, signerName, signerEmail, createdAt, updatedAt) VALUES ('$SDOC', '$ORG_ID', '$STUDENT_ID', 'waiver', 'submitted', 'Parent', '$PARENT_EMAIL', ${T}000, ${T}000)" >/dev/null
check_get "GET /admin/documents pending" 200 "$BASE/admin/documents" "$OWNER_J" "waiver"
post_form "$OWNER_J" "$BASE/admin/documents" "intent=approve" "documentId=$SDOC" > /dev/null
DOC_STATUS=$(D1_one "SELECT status FROM signed_document WHERE id='$SDOC'" "status")
[ "$DOC_STATUS" = "approved" ] && ok "document approved" || bad "doc status=$DOC_STATUS"

section "Practice log sign-off"
PLE="ple_$T"
D1 "INSERT INTO practice_log_entry (id, organizationId, studentId, drivenOn, durationMinutes, nightMinutes, createdAt) VALUES ('$PLE', '$ORG_ID', '$STUDENT_ID', '$TODAY', 60, 0, ${T}000)" >/dev/null
check_get "GET /instructor/practice-log unsigned" 200 "$BASE/instructor/practice-log" "$INST_J" "Pending"
# Earlier signed test seeded a different practice log entry — verify fresh PLE
post_form "$INST_J" "$BASE/instructor/practice-log" "intent=sign" "entryId=$PLE" > /dev/null
SIG=$(D1_one "SELECT signedAt FROM practice_log_entry WHERE id='$PLE'" "signedAt")
[ -n "$SIG" ] && [ "$SIG" != "0" ] && ok "practice log signed off" || bad "practice log sign-off failed (signedAt=$SIG)"

section "Quiz reports + public catalog"
check_get "GET /admin/reports/quizzes" 200 "$BASE/admin/reports/quizzes" "$OWNER_J" "Quiz"
check_get "GET / (anon)"          200 "$BASE/"      "$ANON_J" "directio"
check_get "GET /login"            200 "$BASE/login" "$ANON_J" "Sign"
check_get "GET /signup"           200 "$BASE/signup" "$ANON_J" "Create"

section "Family journey timeline rendered"
RESP=$(curl -sS -L -b "$PARENT_J" "$BASE/family")
echo "$RESP" | grep -qF "Where you are" && ok "journey timeline rendered" \
  || warn "timeline header not seen"
echo "$RESP" | grep -qE "Behind-the-wheel|Road test|Complete" && ok "journey stages rendered" \
  || warn "journey stage names not seen"

section "─────────────────  RESULT  ─────────────────"
echo "PASS=$PASS  FAIL=$FAIL  WARN=$WARN"
if [ $FAIL -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi
