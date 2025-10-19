# ECE1779 Project Proposal

Prepared by:
|Name|Student Number|
|:--:|:---:|
|Wentao Xu|1002434895|
|Jiayi (Jeffery) Guo|1005907306|

## 1.0 Motivation
Consumers looking to purchase concert and entertainment event tickets often face lack of historical context when purchasing a ticket. Platforms such as Ticketmaster employ dynamic pricing algorithms that cause fluctuations in ticket prices based on demand, seats available, and other factors. Our project targets users who wish to purchase entertainment tickets without overpaying. While existing solutions such as Event Spy provide simple price tracking, unlocking more advanced features such as tracking more than 3 events require monthly payment. The need for an open-source, free-to-use app that tracks entertainment pricing history and allows users to make informed purchasing decisions is what motivated our project.

This project is worth pursuing since it addresses a consumer need while realizing cloud-computing concepts from the course. For example, tracking pricing history requires data collection and reliable storage, while being able to track more events or support more users means scalable implementation. As event attendees ourselves, the need to avoid overpaying tickets allowed us to combine our recreational needs with cloud-computing practices to go forward with this project. 

## 2.0 Objective
The primary objective for this project is to develop and deploy an open-source, cloud-based application that tracks event ticket prices over time, allowing users to make informed purchasing decisions with alerts/visualizations. This includes building a reliable data collection and storage scheme that monitors ticket prices through platforms like Ticketmaster and storing those in a PostgreSQL database on the cloud. The application should also provide visualization on price trends over time and alert users when prices change or drop below set thresholds. 

From cloud-computing perspectives, our project should achieve all core technical requirements which includes containerization and local development, state management, deployment on DigitalOcean, orchestration of services, and monitoring through provider tools. Our project should also implement a number of additional features including security practices with user authentication, serverless integration for event notification, automated backup for fault-tolerance, and real-time UI update if time allows.

## 3.0 Key Features
In this section, we will introduce the advanced features in addition to the mandatory features in our project, as well as how those features fulfill the course project requirements. We will also provide a detailed implementation plan, such as orchestration approach, deployment provider selection and database schema.

## 3.1 Features Description
### 3.1.1 Planned Advanced Features
**Security and user authentication**  
We will implement authentication backed by server-side sessions. Successful logins set an http-Only, Secure, SameSite cookie over HTTPS. Secrets are managed with Docker Swarm Secrets.

**Serverless integration (Event notification)**  
Another advanced feature could be serverless notification for critical events. In our project, a “critical event” means a sharp price swing or the price crossing a user-defined threshold. A user would get notification if the interested game/concerts has such a “critical event”. 

To achieve this, we could (i) define a cron-triggered function that runs every minute to fetch price updates and store them into the database via PostgreSQL and (ii) implement an HTTP-invoked cloud function on DigitalOcean Functions that is called by our backend whenever a price threshold is crossed. 

**Backup and Recovery**  
We will add automated logical backups and a tested restore path to protect application state. To do this, we can schedule a job that runs pg_dump against PostgreSQL, compresses the archive, and uploads it to an S3-compatible bucket on DigitalOcean Spaces.

**Real-time Functionality (Optional)**  
This is an optional feature and we’ll implement it if time allows. We will implement an auto-updating UI that reflects the latest ticket price/availability changes without manual refresh.To support this from day one, we’ll use a dual-source ingestion design: initially a historical replay module emits past price changes in order (at controllable speed). Later, if an official API becomes available, we swap in a live feed adapter—both producing the same event format and flowing through the same pipeline. The UI updates immediately when new events arrive, with lightweight polling as a graceful fallback if the real-time channel is unavailable.

### 3.1.2 Orchestraion Approach
Comparing to Kubernetes, Docker Swarm has following pros: 
- Swarm is built into Docker, which means it is easy to get started, especially for developers who have experience with Docker Compose like us.
- Integrates natively with the Docker ecosystem and tools.
- Suitable for small projects and deployments

And the following cons: 
- It may not be ideal for very large-scale, complex, and highly distributed applications.
- Offers fewer advanced features for networking, security, and monitoring.
- Can be less flexible for complex networking requirements.

**Chosen approach & why:**  
We will start with Docker Swarm to reach a production-like demo quickly: it’s built into Docker, works directly with our Compose file, and is sufficient to showcase replicas, service discovery, and persistent storage within our course scope. If time permits, we’ll try to migrate to Kubernetes using the same images to gain access to Kubernetes’ richer features.

### 3.1.3 Database Schema and Persistent Storage
**Database schema design logic:**  
Our schema normalizes core entities - users, events, prices, and models “users interested in events” with a dedicated junction table (user_event_interest), which cleanly captures the many-to-many relationship. In case we have more features in the future, the schema can be extended non-disruptively by adding feature-specific tables (e.g., notifications, tagging, etc)

![Figure 1: Proposed Database Schema](https://gcdnb.pbrd.co/images/r9lY0FovrzLH.png?o=1)


**Persistant storage**  
We will use Digital Ocean Block Storage Volume for persistent storage. Our PostgreSQL container stores its data under /var/lib/postgresql/data. This ensures database state survives container restarts and redeployments, and the volume can be resized upward as needed. For Swarm, we add a node label and a placement constraint so the database service only runs on the node that has the volume.

### 3.1.4 Deployment Provider
**Digital Ocean:**
- Storage is persistent and straightforward. Volumes are network block devices developers can attach, move, and resize for Droplets.
- Provides built-in monitoring and alerts (e.g. DO Monitoring)
- Light weight and cheap, suitable for small projects

**Fly.io:**
- Runs apps closer to users by default, suitable for latency sensitive apps
- Provides built-in Prometheus metrics and Grafana dashboards
- More expensive

**Our selection & why**  
We chose DigitalOcean as our deployment provider because it hits the required checkboxes with the least friction for a two-person, seven-week lightweight course project. Since our project is not latency-sensitive, DigitalOcean has block storage volumes that make PostgreSQL persistence simple. It also provides automated database backups. Considering the budget, the size of the project, and our learning time (we already had hands-on experience with DigitalOcean from Assignment 1), we decided to go with DigitalOcean.

### 3.1.5 Monitoring Setup
We will use provider-native monitoring. On DigitalOcean, we can enable the Monitoring agent on our Droplet to collect CPU, memory, disk/volume metrics and configure baseline alerts with email notifications. In case we want a more precise monitoring system, we can pin these graphs as our dashboard and add a 1-minute HTTP uptime check.

## 3.2 How These Features Fulfill the Course Project Requirements

### 3.2.1 For Core Technical Requirements
**Containerization & Local Development**: The API and PostgreSQL run as Docker containers, orchestrated with Docker Compose for a parity local stack (app + DB + seeding/replay job).

**State Management**: We use PostgreSQL with a normalized schema. The DB data directory is bind-mounted to a persistent DigitalOcean Block Storage Volume so data survives restarts and redeployments.

**Deployment Provider**: We deploy on DigitalOcean (Droplet + Volume), with Spaces for object storage and Functions for background jobs; this keeps costs and setup friction low while matching course tooling.

**Orchestration Approach**: We start with Docker Swarm to achieve replicas, service discovery, and leave a clear path to migrate to DOKS (managed Kubernetes) later.

**Monitoring and Observability**: DigitalOcean Monitoring is enabled for CPU/memory/disk/volume metrics with email alerts

### 3.2.2 For Advanced Technical Requirements
We are planning to implement 2-3 advanced features, including security and user authentication, serverless integration, backup and recovery, and potentially implement real-time functionality. The details of these features are described in [Section 3.1.1](#311-planned-advanced-features).

## 3.3 Project Scope and Feasibility
**Project Scope**  
We scope the project to a focused, stateful web app that ingests event metadata, persists time-series price data, and delivers alerts/visualizations. We'll start with a historical replay pipeline for price tickets and swap in a live data adapter only if an official API is available, keeping the ingestion interface constant.

**Feasibility within the timeframe**  
The required stack on DigitalOcean and Docker Swarm is lightweight and familiar to us. We estimate the effort for core features to be no more than twice that of a regular assignment, so we expect to complete them before the presentation. For advanced features, lightweight items such as serverless integration and backup & recovery can be delivered within 1–2 weeks, leaving room to implement optional real-time functionality.

## 4.0 Tentative Plan
In the first week, we plan to set up the project and get the core features running locally.
In the second week, we aim to move everything to DigitalOcean and have the core features running online.
If things do not go as planned in the third week, we will use that week to polish the core features and ensure they are completed by the end of week 3. Otherwise, we will start advanced features on week3. 
The fourth week is for presentation preparation. 
Week 5&6 are for advanced features. 
The seventh week is for the final report and video. 

|**Week**|**Wentao Xu**|**Jeffery Guo**|**Team Goal**|
|--------|--------|---------|-------|
|**Week 1**|- UI Skeleton <br>- Prepare sample dataset and loader | - Initialize Dockker/Compose for API and PostgreSQL <br>- Implement base REST API| Get the core features running locally |
| **Week 2** | - Wire UI to backend<br>- Set up price alert UI<br>- Digital Ocean monitoring set up | - Create digital ocean droplet and block storage volume<br>- Single node swarm | App reachable with core features online |
| **Week 3** | - Backup and recovery | - Security and authentication | Complete two simple advanced features |
| **Week 4** | - Prepare for presentation | - Prepare for presentation | All core requirements complete<br>Presentation slides complete |
| **Week 5** | - Email notification to end users when ticket price hits threshold | - Serverless ingestion: Scheduled pulling to update ticket price | Complete a more complicated advanced feature |
| **Week 6** | - Websocket channel | - API research | Complete optional advanced feature |
| **Week 7** | - Prepare for final report & video | - Prepare for final report & video | Deliver final report and video |
