/**
 * MCP tool definitions for CrawlSEO.
 * Each tool has a name, description, and zod schema for input validation.
 */

import { z } from "zod";

export const tools = [
  {
    name: "list_sites",
    description:
      "List all monitored sites with their domains and basic info. No parameters required.",
    schema: {},
  },
  {
    name: "get_site_overview",
    description:
      "Get a comprehensive overview of a site including KPIs (clicks, impressions, position, CTR), health score from the latest crawl, and latest Core Web Vitals.",
    schema: {
      siteId: z.string().describe("The site ID to get overview for"),
    },
  },
  {
    name: "get_keywords",
    description:
      "Get top keywords for a site sorted by clicks. Returns query, clicks, impressions, average position, and CTR.",
    schema: {
      siteId: z.string().describe("The site ID"),
      limit: z.number().optional().default(25).describe("Max keywords to return (default 25)"),
      days: z.number().optional().default(28).describe("Lookback period in days (default 28)"),
    },
  },
  {
    name: "get_pages",
    description:
      "Get top pages for a site sorted by clicks. Returns URL, clicks, impressions, average position, and CTR.",
    schema: {
      siteId: z.string().describe("The site ID"),
      limit: z.number().optional().default(25).describe("Max pages to return (default 25)"),
      days: z.number().optional().default(28).describe("Lookback period in days (default 28)"),
    },
  },
  {
    name: "get_traffic",
    description:
      "Get daily traffic data (clicks and impressions) for a site over a given period.",
    schema: {
      siteId: z.string().describe("The site ID"),
      days: z.number().optional().default(90).describe("Lookback period in days (default 90)"),
    },
  },
  {
    name: "run_crawl",
    description:
      "Start a new site crawl. Returns the crawl ID immediately; the crawl runs in the background. Use get_crawl_status to check progress.",
    schema: {
      siteId: z.string().describe("The site ID to crawl"),
      maxPages: z.number().optional().default(200).describe("Maximum pages to crawl (default 200)"),
    },
  },
  {
    name: "get_crawl_status",
    description:
      "Check the status of a crawl by its ID. Returns status (PENDING/RUNNING/COMPLETED/FAILED), pages found, issues found, and health score.",
    schema: {
      crawlId: z.string().describe("The crawl ID to check"),
    },
  },
  {
    name: "get_crawl_issues",
    description:
      "Get issues found during a crawl. Can be filtered by severity (CRITICAL, WARNING, INFO).",
    schema: {
      crawlId: z.string().describe("The crawl ID"),
      severity: z
        .string()
        .optional()
        .describe("Filter by severity: CRITICAL, WARNING, or INFO"),
      limit: z.number().optional().default(50).describe("Max issues to return (default 50)"),
    },
  },
  {
    name: "get_vitals",
    description:
      "Get Core Web Vitals reports for a site. Returns LCP, CLS, INP, TTFB, and performance score.",
    schema: {
      siteId: z.string().describe("The site ID"),
      limit: z.number().optional().default(10).describe("Max reports to return (default 10)"),
    },
  },
  {
    name: "get_opportunities",
    description:
      "Get SEO opportunities for a site: striking-distance keywords, low-CTR keywords, content decay, and keyword cannibalization.",
    schema: {
      siteId: z.string().describe("The site ID"),
    },
  },
  {
    name: "list_objectives",
    description:
      "List the user's objectives (goals that span sites) with their share-of-demand KPI and the number of open tasks.",
    schema: {},
  },
  {
    name: "get_objective",
    description:
      "Get one objective in full: scope, share-of-demand KPI with its 6-period history, top queries for both vocabularies, sub-objectives, and tasks.",
    schema: {
      objectiveId: z.string().describe("The objective ID"),
      status: z.string().optional().describe("Filter tasks by status: TODO, IN_PROGRESS, DONE, DISMISSED (default: open tasks)"),
    },
  },
  {
    name: "sync_objective_actions",
    description:
      "Recompute the rule-generated tasks of an objective from the latest GSC and crawl data, plus the off-site checks (Wikipedia, Wikidata, media blogs, guest sites, social profiles, questions, rising demand, SERP composition, link gap, directories, conversations on YouTube/Bluesky/Reddit). Statuses set by the user are preserved.",
    schema: {
      objectiveId: z.string().describe("The objective ID"),
    },
  },
  {
    name: "add_objective_action",
    description:
      "Add a manual task to an objective (a Wikipedia edit, a backlink request, an article to write).",
    schema: {
      objectiveId: z.string().describe("The objective ID"),
      title: z.string().describe("Short imperative title"),
      type: z.string().optional().describe("CONTENT_NEW, CONTENT_UPDATE, TERMINOLOGY, INTERNAL_LINK, BACKLINK, WIKIPEDIA, PRESS, PROFILE, SOCIAL, TECHNICAL or OTHER"),
      detail: z.string().optional().describe("Why, with which sources, on which page"),
      siteId: z.string().optional().describe("Site the task targets"),
      url: z.string().optional().describe("Page the task targets"),
      priority: z.number().optional().describe("1-100, higher first (default 50)"),
    },
  },
  {
    name: "update_objective_action",
    description: "Change the status or notes of a task.",
    schema: {
      actionId: z.string().describe("The task ID"),
      status: z.string().optional().describe("TODO, IN_PROGRESS, DONE or DISMISSED"),
      notes: z.string().optional().describe("Free-text notes"),
    },
  },
] as const;
