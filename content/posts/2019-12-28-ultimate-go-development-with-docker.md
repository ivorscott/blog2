---
template: post
title: Ultimate Go Development with Docker
slug: ultimate-go-development-with-docker
draft: true
date: 2019-12-27T20:51:27.221Z
description: >-
  Lately, I've been interested in migrating APIs from Node to Go. With Node, I
  had the ultimate workflow, but I had a problem achieving a similar one with
  Go. This post illustrates the use of docker compose to automate live reloading
  a Go API on code changes, debugging it with breakpoints and running tests.
category: development
tags:
  - docker golang delve reload
---
## Intro

Lately, I've been interested in migrating APIs from Node to Go. With Node, I had the ultimate workflow, but I had a problem achieving a similar one with Go. This post illustrates the use of docker compose to automate live reloading a Go API on code changes, debugging it with breakpoints and running tests.

__Warning:__ The majority of this tutorial is IDE agnostic except for the last section on Debugging With VSCode.

If you're planning on using VSCode, I recommended installing [Hadolint's VSCode intergation](https://marketplace.visualstudio.com/items?itemName=exiasr.hadolint), it will keep you from adopting bad practices in your Dockerfiles. There's also [integrations for Vim](https://github.com/hadolint/hadolint/blob/master/docs/INTEGRATION.md#vim-and-neovim), but this is not a showstopper. Hadolint is not required.

### Docker

### Project Starter

### Multi-stage Builds 

### Docker Compose

### Live Reload

### Traefik

### Setting Up Postgres

### Running Tests

### Debugging With VSCode


### Conclusion
