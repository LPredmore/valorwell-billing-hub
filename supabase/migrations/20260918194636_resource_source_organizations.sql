update public.website_resource_sources
set
  organization = case
    when url ~* '^https://(www\.)?va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://department\.va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://www\.ptsd\.va\.gov/' then 'VA National Center for PTSD'
    when url ~* '^https://www\.caregiver\.va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://www\.benefits\.va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://www\.mentalhealth\.va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://www\.mirecc\.va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://www\.myhealth\.va\.gov/' then 'U.S. Department of Veterans Affairs'
    when url ~* '^https://(www\.)?militaryonesource\.mil/' then 'Military OneSource'
    when url ~* '^https://(www\.)?tricare\.mil/' then 'TRICARE'
    when url ~* '^https://uscode\.house\.gov/' then 'U.S. House of Representatives'
    when url ~* '^https://ffr\.cnic\.navy\.mil/' then 'U.S. Navy Fleet and Family Readiness'
    when url ~* '^https://vaccn\.triwest\.com/' then 'TriWest Healthcare Alliance'
    when url ~* '^https://www\.health\.mil/' then 'Military Health System'
    when url ~* '^https://www\.travel\.dod\.mil/' then 'Defense Travel Management Office'
    when url ~* '^https://8tharmy\.korea\.army\.mil/' then 'Eighth Army'
    when url ~* '^https://militarypay\.defense\.gov/' then 'Department of Defense Military Compensation'
    when url ~* '^https://www\.dfas\.mil/' then 'Defense Finance and Accounting Service'
    when url ~* '^https://www\.esd\.whs\.mil/' then 'Washington Headquarters Services'
    when url ~* '^https://vacommunitycare\.com/' then 'VA Community Care Network'
    when url ~* '^https://www1\.deltadentalins\.com/' then 'Delta Dental'
    else organization
  end,
  source_type = case
    when url ~* '^https://uscode\.house\.gov/' then 'statute'
    else source_type
  end,
  updated_at = now()
where organization is null
   or (url ~* '^https://uscode\.house\.gov/' and source_type <> 'statute');
