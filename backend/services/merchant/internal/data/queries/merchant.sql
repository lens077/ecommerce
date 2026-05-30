-- name: SubmitApplication :exec
INSERT INTO merchants.merchant_application(application_id, company_name, credit_code, legal_person, legal_person_id,
                                           contact_phone, business_license_url, legal_person_id_front_url,
                                           legal_person_id_back_url, category_ids, reviewed_at, remark)
VALUES (@application_id,
        @company_name,
        @credit_code,
        @legal_person,
        @legal_person_id,
        @contact_phone,
        @business_license_url,
        @legal_person_id_front_url,
        @legal_person_id_back_url,
        @category_ids,
        @reviewed_at,
        @remark);

-- name: GetApplication :one
SELECT *
FROM merchants.merchant_application
WHERE application_id = @application_id;