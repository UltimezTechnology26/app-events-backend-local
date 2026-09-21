const seo = require('@ultimez-interview/coinpedia-backend-library').seo

const COINPEDIA_HOME_URL = 'https://coinpedia.org/'

// `faq` arrives from each entity's `cln_*_faq_lists` lookup as
// {faq_question, faq_answer} pairs - map to the shared library's expected
// {question, answer} shape. `resolvePageSchema`'s FAQPage builder already
// no-ops when `faqs` is empty, so it's always safe to request 'FAQPage'.
function mapFaqs(faq) {
  return (Array.isArray(faq) ? faq : []).map((item) => ({
    question: item.faq_question,
    answer: item.faq_answer,
  }))
}

function safeCompute(buildFn) {
  try {
    return buildFn()
  } catch (err) {
    console.log('seo_meta_helper compute error.', err.message)
    return null
  }
}

function buildCompanySeoMeta(company) {
  return safeCompute(() => {
    const baseUrl = process.env.APP_COINPEDIA_URL
    const url = `${baseUrl}company/${company.url}/`
    const record = {
      meta_title: company.meta_title,
      meta_keywords: company.meta_keywords,
      meta_description: company.meta_description,
      robots_index: company.robots_index,
      robots_follow: company.robots_follow,
      og_title: company.og_title,
      og_description: company.og_description,
      twitter_title: company.twitter_title,
      twitter_description: company.twitter_description,
      twitter_creator: company.twitter_creator,
      twitter_card: company.twitter_card,
      canonical_url: url,
    }
    const issues = seo.validateSeoRecord(record, {
      expectedCanonicalUrl: url,
      entityName: company.title,
    })
    const score = seo.computeSeoScore(record, issues)

    const sameAs = [
      company.facebook, company.twitter, company.linkedin, company.telegram, company.instagram,
      company.medium, company.reddit, company.feed_url, company.youtube_channel, company.video_link,
      company.website_link,
    ].filter(Boolean)
    const structured_data = seo.resolvePageSchema(['Organization', 'BreadcrumbList', 'FAQPage'], {
      name: company.title,
      url,
      logo: company.image,
      image: company.image,
      ...(company.established_in ? { foundingDate: new Date(company.established_in).toISOString().slice(0, 10) } : {}),
      sameAs,
      faqs: mapFaqs(company.faq),
      breadcrumbItems: [
        { name: 'Home', url: COINPEDIA_HOME_URL },
        { name: 'Companies', url: `${baseUrl}companies/` },
        { name: company.title, url },
      ],
    })

    return { score: score.total, issues, structured_data }
  })
}

function buildProfessionalSeoMeta(professional) {
  return safeCompute(() => {
    const baseUrl = process.env.APP_COINPEDIA_URL
    const url = `${baseUrl}${professional.url}/`
    const record = {
      meta_title: professional.meta_title,
      meta_keywords: professional.meta_keywords,
      meta_description: professional.meta_description,
      robots_index: professional.robots_index,
      robots_follow: professional.robots_follow,
      og_title: professional.og_title,
      og_description: professional.og_description,
      twitter_title: professional.twitter_title,
      twitter_description: professional.twitter_description,
      twitter_creator: professional.twitter_creator,
      twitter_card: professional.twitter_card,
      canonical_url: url,
    }
    const issues = seo.validateSeoRecord(record, {
      expectedCanonicalUrl: url,
      entityName: professional.title,
    })
    const score = seo.computeSeoScore(record, issues)

    const sameAs = [
      professional.facebook, professional.twitter, professional.linkedin, professional.telegram,
      professional.instagram, professional.medium, professional.reddit, professional.feed_url,
      professional.youtube_channel, professional.video_link,
    ].filter(Boolean)
    const structured_data = seo.resolvePageSchema(['Person', 'BreadcrumbList', 'FAQPage'], {
      name: professional.title,
      url,
      image: professional.image,
      description: professional.description,
      ...(professional.work_position ? { jobTitle: professional.work_position } : {}),
      ...(professional.company_name ? { worksFor: { name: professional.company_name } } : {}),
      sameAs,
      faqs: mapFaqs(professional.faq),
      breadcrumbItems: [
        { name: 'Home', url: COINPEDIA_HOME_URL },
        { name: 'Professionals', url: `${baseUrl}professionals/` },
        { name: professional.title, url },
      ],
    })

    return { score: score.total, issues, structured_data }
  })
}

function buildEventSeoMeta(event) {
  return safeCompute(() => {
    const appBaseUrl = process.env.APP_COINPEDIA_URL
    const eventsBaseUrl = process.env.EVENTS_COINPEDIA_URL
    const url = `${eventsBaseUrl}${event.url}/`
    const record = {
      meta_title: event.meta_title,
      meta_keywords: event.meta_keywords,
      meta_description: event.meta_description,
      robots_index: event.robots_index,
      robots_follow: event.robots_follow,
      og_title: event.og_title,
      og_description: event.og_description,
      twitter_title: event.twitter_title,
      twitter_description: event.twitter_description,
      twitter_creator: event.twitter_creator,
      twitter_card: event.twitter_card,
      canonical_url: url,
    }
    const issues = seo.validateSeoRecord(record, {
      expectedCanonicalUrl: url,
      entityName: event.title,
    })
    const score = seo.computeSeoScore(record, issues)

    // `event_type`'s numeric convention isn't confirmed, so the online/offline
    // discriminator instead relies on the presence of a webinar link - a
    // directly meaningful signal already on the record.
    const virtual = Boolean(event.webinar_meeting_link)
    const companyName = Array.isArray(event.company_name) ? event.company_name[0] : event.company_name
    const organizerName = companyName || event.user_full_name
    const structured_data = seo.resolvePageSchema(['Event', 'BreadcrumbList', 'FAQPage'], {
      name: event.title,
      startDate: event.start_date,
      ...(event.end_date ? { endDate: event.end_date } : {}),
      virtual,
      image: event.image,
      description: event.description,
      location: virtual
        ? { url: event.webinar_meeting_link }
        : { name: event.event_venue, address: event.sortname },
      ...(organizerName ? { organizer: { name: organizerName, url: appBaseUrl } } : {}),
      faqs: mapFaqs(event.faq),
      breadcrumbItems: [
        { name: 'Home', url: COINPEDIA_HOME_URL },
        { name: 'Events', url: eventsBaseUrl },
        { name: event.title, url },
      ],
    })

    return { score: score.total, issues, structured_data }
  })
}

module.exports = { buildCompanySeoMeta, buildProfessionalSeoMeta, buildEventSeoMeta }
