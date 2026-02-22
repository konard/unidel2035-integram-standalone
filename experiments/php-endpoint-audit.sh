#!/bin/bash
# PHP Endpoint Audit Script
# Tests all endpoints against the PHP server at ai2o.ru and saves responses

PHP_URL="https://ai2o.ru"
DB="my"
COOKIES="/tmp/php_cookies.txt"
RESULTS_DIR="./experiments/php_responses"

mkdir -p $RESULTS_DIR

echo "=== PHP Server Endpoint Audit ==="
echo "Server: $PHP_URL"
echo "Database: $DB"
echo ""

# Clean up old cookies
rm -f $COOKIES

# 1. Authentication
echo "--- Auth Group ---"

echo "1. POST /my/auth (login)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/auth?JSON" -X POST -d "login=admin&pwd=admin" > $RESULTS_DIR/auth_login.json
cat $RESULTS_DIR/auth_login.json
echo ""

echo "2. POST /my/auth (wrong credentials)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/auth?JSON" -X POST -d "login=admin&pwd=wrongpwd" > $RESULTS_DIR/auth_wrong.json
cat $RESULTS_DIR/auth_wrong.json
echo ""

echo "3. GET /my/xsrf"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/xsrf?JSON" > $RESULTS_DIR/xsrf.json
cat $RESULTS_DIR/xsrf.json
echo ""

echo "4. GET /my/terms"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/terms?JSON" > $RESULTS_DIR/terms.json
echo "Terms count: $(cat $RESULTS_DIR/terms.json | jq 'length' 2>/dev/null || echo 'N/A')"
echo ""

echo "5. GET /my/metadata"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/metadata?JSON" > $RESULTS_DIR/metadata.json
echo "Metadata saved. Size: $(wc -c < $RESULTS_DIR/metadata.json) bytes"
echo ""

echo "6. GET /my/metadata/18 (USER type)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/metadata/18?JSON" > $RESULTS_DIR/metadata_18.json
cat $RESULTS_DIR/metadata_18.json | head -c 500
echo ""
echo ""

# Get a sample type and object for testing
echo "7. GET /my/_list/18 (list users)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_list/18?JSON" > $RESULTS_DIR/list_18.json
echo "List users saved"
echo ""

echo "8. GET /my/_dict/18"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_dict/18?JSON" > $RESULTS_DIR/dict_18.json
echo "Dict saved. First 300 chars:"
cat $RESULTS_DIR/dict_18.json | head -c 300
echo ""
echo ""

# Test _ref_reqs (need a ref type)
echo "9. GET /my/_ref_reqs/42 (ROLE type)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_ref_reqs/42?JSON" > $RESULTS_DIR/ref_reqs_42.json
cat $RESULTS_DIR/ref_reqs_42.json | head -c 500
echo ""
echo ""

# Test report endpoints
echo "--- Report Group ---"
echo "10. GET /my/report (list reports)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/report?JSON" > $RESULTS_DIR/report_list.json
cat $RESULTS_DIR/report_list.json | head -c 500
echo ""
echo ""

# Test DDL - create a test type
echo "--- DDL Group (creating test type) ---"
echo "11. POST /my/_d_new"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_new?JSON" -X POST -d "val=AuditTestType_$(date +%s)&t=1" > $RESULTS_DIR/d_new.json
cat $RESULTS_DIR/d_new.json
echo ""

# Extract the new type ID for further testing
NEW_TYPE_ID=$(cat $RESULTS_DIR/d_new.json | jq -r '.obj // empty' 2>/dev/null)
echo "New type ID: $NEW_TYPE_ID"
echo ""

if [ -n "$NEW_TYPE_ID" ] && [ "$NEW_TYPE_ID" != "null" ]; then
    echo "12. POST /my/_d_save/$NEW_TYPE_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_save/$NEW_TYPE_ID?JSON" -X POST -d "val=AuditTestTypeRenamed" > $RESULTS_DIR/d_save.json
    cat $RESULTS_DIR/d_save.json
    echo ""

    echo "13. GET /my/_d_main/$NEW_TYPE_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_main/$NEW_TYPE_ID?JSON" > $RESULTS_DIR/d_main.json
    cat $RESULTS_DIR/d_main.json | head -c 500
    echo ""
    echo ""

    echo "14. POST /my/_d_req/$NEW_TYPE_ID (add requisite)"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_req/$NEW_TYPE_ID?JSON" -X POST -d "req=3&val=TestField" > $RESULTS_DIR/d_req.json
    cat $RESULTS_DIR/d_req.json
    echo ""

    # Get new req ID
    NEW_REQ_ID=$(cat $RESULTS_DIR/d_req.json | jq -r '.id // empty' 2>/dev/null)
    echo "New req ID: $NEW_REQ_ID"

    if [ -n "$NEW_REQ_ID" ] && [ "$NEW_REQ_ID" != "null" ]; then
        echo "15. POST /my/_d_alias/$NEW_REQ_ID"
        curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_alias/$NEW_REQ_ID?JSON" -X POST -d "alias=myalias" > $RESULTS_DIR/d_alias.json
        cat $RESULTS_DIR/d_alias.json
        echo ""

        echo "16. POST /my/_d_null/$NEW_REQ_ID"
        curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_null/$NEW_REQ_ID?JSON" -X POST > $RESULTS_DIR/d_null.json
        cat $RESULTS_DIR/d_null.json
        echo ""

        echo "17. POST /my/_d_multi/$NEW_REQ_ID"
        curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_multi/$NEW_REQ_ID?JSON" -X POST > $RESULTS_DIR/d_multi.json
        cat $RESULTS_DIR/d_multi.json
        echo ""

        echo "18. POST /my/_d_attrs/$NEW_REQ_ID"
        curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_attrs/$NEW_REQ_ID?JSON" -X POST -d "alias=newattr&required=1" > $RESULTS_DIR/d_attrs.json
        cat $RESULTS_DIR/d_attrs.json
        echo ""

        echo "19. POST /my/_d_ord/$NEW_REQ_ID"
        curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_ord/$NEW_REQ_ID?JSON" -X POST -d "order=5" > $RESULTS_DIR/d_ord.json
        cat $RESULTS_DIR/d_ord.json
        echo ""

        echo "20. POST /my/_d_del_req/$NEW_REQ_ID"
        curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_del_req/$NEW_REQ_ID?JSON" -X POST > $RESULTS_DIR/d_del_req.json
        cat $RESULTS_DIR/d_del_req.json
        echo ""
    fi

    echo "21. POST /my/_d_ref/$NEW_TYPE_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_ref/$NEW_TYPE_ID?JSON" -X POST > $RESULTS_DIR/d_ref.json
    cat $RESULTS_DIR/d_ref.json
    echo ""

    # Clean up - delete the test type
    echo "22. POST /my/_d_del/$NEW_TYPE_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_d_del/$NEW_TYPE_ID?JSON" -X POST > $RESULTS_DIR/d_del.json
    cat $RESULTS_DIR/d_del.json
    echo ""
fi

# DML tests - create a test object
echo "--- DML Group ---"
echo "23. POST /my/_m_new/3 (create SHORT object)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_m_new/3?JSON" -X POST -d "val=AuditTestObj_$(date +%s)" > $RESULTS_DIR/m_new.json
cat $RESULTS_DIR/m_new.json
echo ""

NEW_OBJ_ID=$(cat $RESULTS_DIR/m_new.json | jq -r '.obj // empty' 2>/dev/null)
echo "New object ID: $NEW_OBJ_ID"
echo ""

if [ -n "$NEW_OBJ_ID" ] && [ "$NEW_OBJ_ID" != "null" ]; then
    echo "24. POST /my/_m_save/$NEW_OBJ_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_m_save/$NEW_OBJ_ID?JSON" -X POST -d "val=AuditTestObjUpdated" > $RESULTS_DIR/m_save.json
    cat $RESULTS_DIR/m_save.json
    echo ""

    echo "25. GET /my/obj_meta/$NEW_OBJ_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/obj_meta/$NEW_OBJ_ID?JSON" > $RESULTS_DIR/obj_meta.json
    cat $RESULTS_DIR/obj_meta.json | head -c 500
    echo ""
    echo ""

    echo "26. POST /my/_m_up/$NEW_OBJ_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_m_up/$NEW_OBJ_ID?JSON" -X POST > $RESULTS_DIR/m_up.json
    cat $RESULTS_DIR/m_up.json
    echo ""

    echo "27. POST /my/_m_ord/$NEW_OBJ_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_m_ord/$NEW_OBJ_ID?JSON" -X POST -d "ord=100" > $RESULTS_DIR/m_ord.json
    cat $RESULTS_DIR/m_ord.json
    echo ""

    echo "28. POST /my/_m_del/$NEW_OBJ_ID"
    curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/_m_del/$NEW_OBJ_ID?JSON" -X POST > $RESULTS_DIR/m_del.json
    cat $RESULTS_DIR/m_del.json
    echo ""
fi

# Test auth variations
echo "--- Additional Auth Tests ---"

echo "29. POST /my/auth?reset"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/auth?JSON&reset" -X POST -d "login=admin" > $RESULTS_DIR/auth_reset.json
cat $RESULTS_DIR/auth_reset.json
echo ""

echo "30. POST /my/getcode"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/getcode?JSON" -X POST -d "u=test@example.com" > $RESULTS_DIR/getcode.json
cat $RESULTS_DIR/getcode.json
echo ""

echo "31. POST /my/checkcode"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/checkcode?JSON" -X POST -d "u=test@example.com&c=test" > $RESULTS_DIR/checkcode.json
cat $RESULTS_DIR/checkcode.json
echo ""

echo "32. POST /my/jwt (bad token)"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/jwt?JSON" -X POST -d "jwt=invalid_token" > $RESULTS_DIR/jwt_bad.json
cat $RESULTS_DIR/jwt_bad.json
echo ""

echo "33. POST /my/confirm"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/confirm?JSON" -X POST -d "u=admin&o=oldhash&p=newhash" > $RESULTS_DIR/confirm.json
cat $RESULTS_DIR/confirm.json
echo ""

echo "34. POST /my/exit"
curl -s -c $COOKIES -b $COOKIES "$PHP_URL/$DB/exit?JSON" -X POST > $RESULTS_DIR/exit.json
cat $RESULTS_DIR/exit.json
echo ""

echo ""
echo "=== Audit Complete ==="
echo "All responses saved to $RESULTS_DIR/"
ls -la $RESULTS_DIR/
