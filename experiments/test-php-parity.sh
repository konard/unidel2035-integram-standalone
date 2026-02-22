#!/bin/bash
# PHP vs Node.js endpoint parity test script
# Issue #166 - Re-audit after sessions 17-19 fixes

set -e

PHP_BASE="https://ai2o.ru"
DB="my"
OUTPUT_DIR="/tmp/gh-issue-solver-1771728256863/experiments/php_responses"

mkdir -p "$OUTPUT_DIR"

echo "=== PHP Server Endpoint Parity Test ==="
echo "Date: $(date)"
echo "PHP Base: $PHP_BASE"
echo ""

# Step 1: Authenticate to get session cookie (PHP sends cookie on successful auth)
echo ">>> Step 1: Authenticating to get session..."

# First, we need an XSRF token - but PHP requires auth to get one
# So we do a preliminary auth attempt to establish the session
curl -s -c /tmp/php.cookie -b "tzone=-180" \
  -X POST "$PHP_BASE/$DB/auth?JSON=1" \
  -d "login=d&pwd=d" > "$OUTPUT_DIR/auth_initial.json"

echo "Initial auth response:"
cat "$OUTPUT_DIR/auth_initial.json"
echo ""

# Now we have a session cookie, get XSRF token
echo ""
echo ">>> Step 2: Getting XSRF token with session cookie..."
curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/xsrf?JSON=1" > "$OUTPUT_DIR/xsrf_after_auth.json"
cat "$OUTPUT_DIR/xsrf_after_auth.json"
echo ""

PHP_XSRF=$(python3 -c "
import json
try:
    with open('$OUTPUT_DIR/xsrf_after_auth.json') as f:
        data = json.load(f)
    if isinstance(data, dict):
        print(data.get('_xsrf', ''))
    elif isinstance(data, list) and len(data) > 0:
        print(data[0].get('_xsrf', ''))
except Exception as e:
    print('')
")

echo "XSRF Token: ${PHP_XSRF:0:22}..."

if [ -z "$PHP_XSRF" ]; then
    echo "WARNING: Could not get XSRF token - some tests may fail"
fi

# ============================================================================
# A. AUTH & SESSION ENDPOINTS
# ============================================================================

echo ""
echo "=========================================="
echo "A. AUTH & SESSION ENDPOINTS"
echo "=========================================="

# Test xsrf endpoint
echo ""
echo ">>> A.1: GET /$DB/xsrf?JSON=1"
curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/xsrf?JSON=1" > "$OUTPUT_DIR/xsrf.json"
cat "$OUTPUT_DIR/xsrf.json"
echo ""

# Check id type in xsrf response
echo "Checking id field type..."
python3 -c "
import json
with open('$OUTPUT_DIR/xsrf.json') as f:
    data = json.load(f)
    if isinstance(data, dict):
        id_val = data.get('id')
        print(f'id value: {id_val!r}')
        print(f'id type: {type(id_val).__name__}')
        if isinstance(id_val, str):
            print('✅ id is STRING (correct)')
        else:
            print('❌ id is NOT string (BUG)')
    else:
        print(f'Response is not a dict: {data}')
"

# Test auth - valid credentials
echo ""
echo ">>> A.2: POST /$DB/auth?JSON=1 (valid credentials)"
curl -s -c /tmp/php.cookie -b /tmp/php.cookie \
  -X POST "$PHP_BASE/$DB/auth?JSON=1" \
  -d "login=d&pwd=d&_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/auth_valid.json"
cat "$OUTPUT_DIR/auth_valid.json"
echo ""

# Check id type in auth response
echo "Checking id field type in auth response..."
python3 -c "
import json
with open('$OUTPUT_DIR/auth_valid.json') as f:
    data = json.load(f)
    if isinstance(data, dict):
        id_val = data.get('id')
        print(f'id value: {id_val!r}')
        print(f'id type: {type(id_val).__name__}')
        if isinstance(id_val, str):
            print('✅ id is STRING (correct)')
        else:
            print('❌ id is NOT string (BUG)')
    else:
        print(f'Response is not a dict: {data}')
"

# Refresh XSRF
PHP_XSRF=$(python3 -c "
import json
with open('$OUTPUT_DIR/xsrf.json') as f:
    data = json.load(f)
    if isinstance(data, dict):
        print(data.get('_xsrf', ''))
" 2>/dev/null || echo "")

# Test auth - wrong password
echo ""
echo ">>> A.3: POST /$DB/auth?JSON=1 (wrong password)"
curl -s -b /tmp/php.cookie \
  -X POST "$PHP_BASE/$DB/auth?JSON=1" \
  -d "login=d&pwd=WRONGPASSWORD&_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/auth_wrong.json"
cat "$OUTPUT_DIR/auth_wrong.json"
echo ""

# Test exit endpoint
echo ""
echo ">>> A.4: POST /$DB/exit?JSON=1"
# Re-auth first to have valid session
curl -s -c /tmp/php.cookie -b /tmp/php.cookie \
  -X POST "$PHP_BASE/$DB/auth?JSON=1" \
  -d "login=d&pwd=d&_xsrf=$PHP_XSRF" > /dev/null 2>&1

curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/xsrf?JSON=1" > "$OUTPUT_DIR/xsrf_temp.json"
PHP_XSRF=$(python3 -c "
import json
with open('$OUTPUT_DIR/xsrf_temp.json') as f:
    data = json.load(f)
    if isinstance(data, dict):
        print(data.get('_xsrf', ''))
" 2>/dev/null || echo "")

curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/exit?JSON=1" \
  -d "_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/exit.json"
cat "$OUTPUT_DIR/exit.json"
echo ""

# Re-authenticate for remaining tests
curl -s -c /tmp/php.cookie -b "tzone=-180" \
  -X POST "$PHP_BASE/$DB/auth?JSON=1" \
  -d "login=d&pwd=d" > /dev/null 2>&1
curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/xsrf?JSON=1" > "$OUTPUT_DIR/xsrf_temp.json"
PHP_XSRF=$(python3 -c "
import json
with open('$OUTPUT_DIR/xsrf_temp.json') as f:
    data = json.load(f)
    if isinstance(data, dict):
        print(data.get('_xsrf', ''))
" 2>/dev/null || echo "")

# Test checkcode with wrong code
echo ""
echo ">>> A.5: POST /$DB/checkcode?JSON=1 (wrong code)"
curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/checkcode?JSON=1" \
  -d "c=XXXX&u=nobody@nowhere.xyz&_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/checkcode_wrong.json"
cat "$OUTPUT_DIR/checkcode_wrong.json"
echo ""

# Test confirm with wrong hash
echo ""
echo ">>> A.6: POST /$DB/confirm?JSON=1 (wrong hash)"
curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/confirm?JSON=1" \
  -d "u=d&o=wronghash&p=samehash&_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/confirm_wrong.json"
cat "$OUTPUT_DIR/confirm_wrong.json"
echo ""

# ============================================================================
# B. UTILITY / QUERY ENDPOINTS
# ============================================================================

echo ""
echo "=========================================="
echo "B. UTILITY / QUERY ENDPOINTS"
echo "=========================================="

# Test terms
echo ""
echo ">>> B.1: GET /$DB/terms?JSON=1"
curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/terms?JSON=1" > "$OUTPUT_DIR/terms.json"
echo "Response (first 500 chars):"
head -c 500 "$OUTPUT_DIR/terms.json"
echo "..."
echo ""

# Test dict
echo ""
echo ">>> B.2: GET /$DB/dict?JSON=1"
curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/dict?JSON=1" > "$OUTPUT_DIR/dict.json"
echo "Response (first 500 chars):"
head -c 500 "$OUTPUT_DIR/dict.json"
echo "..."
echo ""

# ============================================================================
# C. DML ENDPOINTS - CRITICAL TESTS
# ============================================================================

echo ""
echo "=========================================="
echo "C. DML ENDPOINTS - CRITICAL TESTS"
echo "=========================================="

# Get a test type ID first (type 18 is USER)
TEST_TYPE_ID=18

# Test _m_new with invalid up=0
echo ""
echo ">>> C.1: POST /$DB/_m_new/0?JSON=1 (invalid - up=0 for non-root type)"
curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/_m_new/0?JSON=1" \
  -d "id=$TEST_TYPE_ID&up=0&_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/m_new_invalid.json"
cat "$OUTPUT_DIR/m_new_invalid.json"
echo ""

# Test _m_ord with invalid order
echo ""
echo ">>> C.2: POST /$DB/_m_ord/1?JSON=1&order=abc (invalid order)"
curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/_m_ord/1?JSON=1&order=abc" \
  -d "_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/m_ord_invalid.txt"
echo "Response (raw):"
cat "$OUTPUT_DIR/m_ord_invalid.txt"
echo ""

# Check if m_ord invalid returns plain text (not JSON)
echo "Checking if response is plain text..."
if grep -q '"' "$OUTPUT_DIR/m_ord_invalid.txt"; then
    echo "⚠️ Response contains quotes - may be JSON"
else
    echo "✅ Response appears to be plain text"
fi

# Find a valid object ID for _m_ord test
echo ""
echo ">>> Finding a valid object ID for _m_ord test..."
curl -s -b /tmp/php.cookie "$PHP_BASE/$DB/object/18?JSON=1" > "$OUTPUT_DIR/objects_18.json"
TEST_OBJ_ID=$(python3 -c "
import json
try:
    with open('$OUTPUT_DIR/objects_18.json') as f:
        data = json.load(f)
    if isinstance(data, dict) and 'object' in data:
        objects = data['object']
        if len(objects) > 0:
            print(objects[0].get('id', ''))
except:
    pass
" 2>/dev/null || echo "")

if [ -n "$TEST_OBJ_ID" ]; then
    echo "Using test object ID: $TEST_OBJ_ID"

    # Test _m_ord with valid order
    echo ""
    echo ">>> C.3: POST /$DB/_m_ord/$TEST_OBJ_ID?JSON=1&order=1 (valid order)"
    curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/_m_ord/$TEST_OBJ_ID?JSON=1&order=1" \
      -d "_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/m_ord_valid.json"
    cat "$OUTPUT_DIR/m_ord_valid.json"
    echo ""

    # Check id/obj types in _m_ord response
    echo "Checking id/obj field types in _m_ord..."
    python3 -c "
import json
try:
    with open('$OUTPUT_DIR/m_ord_valid.json') as f:
        data = json.load(f)
    id_val = data.get('id')
    obj_val = data.get('obj')
    print(f'id value: {id_val!r}, type: {type(id_val).__name__}')
    print(f'obj value: {obj_val!r}, type: {type(obj_val).__name__}')
    if isinstance(id_val, str):
        print('✅ id is STRING (correct)')
    else:
        print('❌ id is NOT string (BUG)')
    if isinstance(obj_val, str):
        print('✅ obj is STRING (correct)')
    else:
        print('❌ obj is NOT string (BUG)')
except Exception as e:
    print(f'Error parsing JSON: {e}')
"

    # Test _m_up
    echo ""
    echo ">>> C.4: POST /$DB/_m_up/$TEST_OBJ_ID?JSON=1"
    curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/_m_up/$TEST_OBJ_ID?JSON=1" \
      -d "_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/m_up.json"
    cat "$OUTPUT_DIR/m_up.json"
    echo ""

    # Check id/obj types in _m_up response
    echo "Checking id/obj field types in _m_up..."
    python3 -c "
import json
try:
    with open('$OUTPUT_DIR/m_up.json') as f:
        data = json.load(f)
    id_val = data.get('id')
    obj_val = data.get('obj')
    print(f'id value: {id_val!r}, type: {type(id_val).__name__}')
    print(f'obj value: {obj_val!r}, type: {type(obj_val).__name__}')
    if isinstance(id_val, str):
        print('✅ id is STRING (correct)')
    else:
        print('❌ id is NOT string (BUG)')
    if obj_val is None:
        print('✅ obj is null (correct)')
    else:
        print(f'⚠️ obj is not null: {obj_val!r}')
except Exception as e:
    print(f'Error parsing JSON: {e}')
"
else
    echo "Could not find a valid test object ID - skipping _m_ord and _m_up tests"
fi

# ============================================================================
# D. DDL ENDPOINTS - CRITICAL TESTS
# ============================================================================

echo ""
echo "=========================================="
echo "D. DDL ENDPOINTS - CRITICAL TESTS"
echo "=========================================="

# Test _d_new - create a test type
echo ""
echo ">>> D.1: POST /$DB/_d_new?JSON=1 (create test type)"
TEST_TYPE_NAME="AuditTestType_$(date +%s)"
curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/_d_new?JSON=1" \
  -d "t=8&val=$TEST_TYPE_NAME&_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/d_new.json"
cat "$OUTPUT_DIR/d_new.json"
echo ""

# Check id field type in _d_new response
echo "Checking id field type in _d_new..."
python3 -c "
import json
try:
    with open('$OUTPUT_DIR/d_new.json') as f:
        data = json.load(f)
    id_val = data.get('id')
    obj_val = data.get('obj')
    print(f'id value: {id_val!r}, type: {type(id_val).__name__}')
    print(f'obj value: {obj_val!r}, type: {type(obj_val).__name__}')
    if id_val == '':
        print('✅ id is EMPTY STRING (correct)')
    elif isinstance(id_val, str):
        print('⚠️ id is non-empty STRING')
    else:
        print('❌ id is NOT string (BUG)')
except Exception as e:
    print(f'Error parsing JSON: {e}')
"

# Extract new type ID for cleanup
NEW_TYPE_ID=$(python3 -c "
import json
try:
    with open('$OUTPUT_DIR/d_new.json') as f:
        data = json.load(f)
    print(data.get('obj', ''))
except:
    pass
" 2>/dev/null || echo "")

if [ -n "$NEW_TYPE_ID" ]; then
    echo ""
    echo ">>> D.2: POST /$DB/_d_del/$NEW_TYPE_ID?JSON=1 (delete test type)"
    curl -s -b /tmp/php.cookie -X POST "$PHP_BASE/$DB/_d_del/$NEW_TYPE_ID?JSON=1" \
      -d "_xsrf=$PHP_XSRF" > "$OUTPUT_DIR/d_del.json"
    cat "$OUTPUT_DIR/d_del.json"
    echo ""
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo "All PHP responses saved to: $OUTPUT_DIR"
echo ""
ls -la "$OUTPUT_DIR"
echo ""
echo "Test completed at: $(date)"
