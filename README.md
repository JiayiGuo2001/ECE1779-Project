# ECE1779 Project Final Deliverable

Prepared by:
|Name|Student Number|Email|
|:--:|:---:|:--:|
|Wentao Xu|1002434895|wentao.xu@mail.utoronto.ca|
|Jiayi (Jeffery) Guo|1005907306|jeffery.guo@mail.utoronto.ca|

## 1.0 Motivation

## 2.0 Objectives

## 3.0 Technical Stack

## 4.0 Features

## 5.0 User Guide

## 6.0 Development Guide
**Credentials sent to TA**
This section provides detailed instructions for setting up the development environment, database, and local testing using Docker Swarm

Please note that since the cron-triggered function uses Digital Ocean Function, the functinoality is not available to test locally. 
### 6.1 Prerequisites:
- Docker
- OpenSSL (for self-signing certificates)
- curl
- jq (optional for pretty-printing JSON resposne)

### 6.2 Project Structure
The project requires a parent directory containint the main project directory along with `nginx/` and `ssl/` directories for local testing:
```
Project/                          # Parent directory
├── ECE1779-Project/              # Main project repository
├── nginx/                        # Nginx configuration
│   └── nginx.conf                # Nginx reverse proxy config
├── ssl/                          # SSL certificates
│   ├── cert.pem                  # SSL certificate
│   └── key.pem                   # SSL private key
└── postgres_data/                # PostgreSQL data (created automatically)
```

### 6.3: Steps to Run App Locally
#### Step 1: Set Up Directory Structure
```bash
mkdir -p <path_to_project>/Project_Ticket_Tracker
cd <path_to_project>/Project_Ticket_Tracker

# clone repository
git clone https://github.com/JiayiGuo2001/ECE1779-Project.git

# create nginx and ssl directories
mkdir -p nginx ssl postgres_data
```

#### Step 2: Generate Self-Signed SSL certificate
```bash
cd ./ssl

# Generate self-signed cert 
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem \
  -out cert.pem \
  -subj "/C=CA/ST=Ontario/L=Toronto/O=ECE1779/OU-Project/CN=localhost"
```

#### Step 3: Create Nginx configuration
Create the file `<path_to_project>/Project_Ticket_Tracker/nginx/nginx.conf`:

```bash
cd <path_to_project>/Project_Ticket_Tracker
cat > ./nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        
        ssl_certificate /etc/ssl/server.crt;
        ssl_certificate_key /etc/ssl/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://ticket-tracker-app:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-Proto https;
        }
    }
}

EOF
```

#### Step 4: Update stack.local.yaml Paths if needed
If the project structure is correct (`ssl/`, `nginx/` and `postgres_data` directories are in the parent directory of the main project), no need to chagne stack.local.yaml. If stored elsewhere, edit stack.local.yaml to match nginx, ssl and postgres_data directories.

#### Step 5: Initialize docker Swarm
```bash
docker swarm init
```

#### Step 6: Create the External Network
docker network create --driver overlay app_network

#### Step 7: Create Docker Secrets
**Note: The docker secrets have been provided to TA via Email. These are just place holders**
```bash
# DB credentials:
echo "postgres_db_username" | docker secret create db_user - 
echo "postgres_db_password" | docker secret create db_password - 

# Gmail OAuth2 credentials (for email notification alerts)
echo "gmail_client_id" | docker secret create gmail_client_id - 
echo "gmail_client_secret" | docker secret create gmail_client_secret - 
echo "gmail_refresh_token" | docker secret create gmail_refresh_token - 

# Ticketmaster API key (Required for event search)
echo "ticketmaster_api_key" | docker secret create ticketmaster_api_key - 
```
Feel free to use your own gmail OAuth2 credentials or ticketmaster api key if you have them. 

#### Step 8: Build API Docker Image and Deploy the Stack
```bash
cd <path_to_project>/Project_Ticket_Tracker/ECE1779-Project
docker build -t ticket-tracker-api:latest. --no-cache
docker stack deploy -c stack.local.yaml ticket-tracker
```

#### Step 9: Verify Deployment
```bash
# Check running services
docker stack services ticket-tracker

# View logs from each service
docker service logs ticket-tracker_ticket-tracker-app
docker service logs ticket-tracker_postgres
docker service logs ticket-trakcer_nginx
```

#### Step 10: Accessing the service
After all three services are running, the UI can be accessed from https://localhost. Note that the browser would display a warning since this is a self-signed certificate. 

At this point the server is also accessible using curl.
## 7.0 Deployment Information

## 8.0 Individual Contributions
### 8.1 Jiayi Guo:
### 8.2 Wentao Xu:
