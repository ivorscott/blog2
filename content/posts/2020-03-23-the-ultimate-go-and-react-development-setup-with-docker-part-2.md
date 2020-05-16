---
template: post
title: Transitioning to Go pt.2
slug: ultimate-go-react-development-setup-with-docker-part2
draft: false
date: 2020-02-23T10:55:15.296Z
description: >-
  Transitioning to Go from another language is challenging. This is not a tutorial. In this post I share the obstacles I faced.
category: "Go and React Series"
tags:
  - Golang
socialImage: "/media/part2.jpg"
---

<!-- PART OF A SERIES -->
<center>
<i>
  <a href ="/category/go-and-react-series/">Part of the Go and React Series</a>
</i>
</center>

![](/media/part2.jpg)

# Introduction

[Part 1](/ultimate-go-react-development-setup-with-docker) demonstrated how to streamline a development workflow using Docker, docker-compose and Makefiles. This post covers transitioning to Go, why you might want to and the challenges you can expect.

We focus on:

- [Why Go?](#why-go)
- [Challenges](#challenges)

# Why Go?

### 1. Renowned Creators

The original creators of the language have amazing credentials. Ken Thompson, Rob Pike and Robert Griesemer, are the people behind Unix, UTF-8, the B programming language (predecessor to the C programming language) and the Hotspot JVM, all of them worked on the orginal Go Team at Google. Listen to [Creating the Go programming langauge](https://changelog.com/gotime/100) on Go time for the full story.

### 2. Simple Concurrency Model

Concurrency is incredibly difficult to get right even when there is language support. Go has [concurrency primatives](https://www.golang-book.com/books/intro/10) called go routines designed to leverage all the cores on your machine and it's one of the first modern programming languages to take advantage of this.

### 3. Fast Compilation

Go has fast compile times because of dependency analysis. In Go unused dependencies are considered a compile-time error not a warning. This guarantees that no extra code will be compiled during builds, minimizing compilation time. Another factor is involved is circular dependencies are not allowed in the lanuage, keeping the dependency tree lean and clean.

### 4. Proper Built-in Tools

The [standard built-in library](https://golang.org/pkg/) is great.

### 5. 0 Dependency Deployments

During deployments dependencies are not required because everything is compiled into a static binary. This makes it great for container deployments.

### 6. Used By Top Organizations

There's a large [list](https://github.com/golang/go/wiki/GoUsers) of tools and organizations using it: Drone, Portainer, Docker, Kubernetes, Traefik, Atlassian, Netflix, Aqua Security, Hashicorp etc.

### 7. Tooling

Go tooling provides many commands for different development concerns. In addition to the go formatter (`go fmt`), there is `go test`, `go mod` (for module support), `go vet` (to examine Go source code and reports suspicious constructs), `go tool pprof` (a built-in code profiler) and much more.

### 8. Composition Over Inheritance

[Composition over inheritance](https://yourbasic.org/golang/inheritance-object-oriented/) means you won't see the use of the keyword `extends` like in other languages, keeping definitions clean and supporting code reuse.

### 9. Go Influenced Deno

The creator of Node abandoned the framework and developed [Deno](https://deno.land/manual), which was originally wrriten in Go before it being [replaced with Rust](https://github.com/denoland/deno/issues/205). The Go UX remained. For example `deno fmt` comes from `go fmt`, a command for code formating.

I chose to learn and adopt Go but making the transition is not without its challenges. Beyond language syntax and mechanics, I faced 3 big challenges when building production ready services in Go.

# Challenges

### 1. Rethinking The Way An App Is Structured

In Go, you need develop your own set of rules about where packages belong and stick to them. I learned that your application won't compile if you have circular dependencies. In other words, two packages can't cross import one another. This keeps dependency chains clear as well as your mental model of the codebase. It forces you to consider where initialization occurs in your app. Folders also have a special purpose in Go. Folders are static libraries, modules, components, or features with distinct APIs, not a means to organize code arbitrarily but a way to represent unique and purposeful packages with exported and unexported identifiers.

### 2. Choosing Between Built-in Libraries Or 3rd-party Packages

Rolling your own solutions with standard Go libraries takes time but how it works is transparent because you built it. Using a framework takes arguably less time and comes with a rich feature set, but it's not so clear what happens under the hood. With a full-featured library you might only use a fraction of the available features.

### 3. Choosing Between An ORM Or Going Bare Metal With SQL

An ORM like [GORM](https://gorm.io/) can get you to your destination faster but it comes with a cost. GORM can make more queries than otherwise needed under the hood. Going ORM-less already sets you up for taking advantage of the full power of postgres with raw SQL queries. Plus, ORMs can't possibly cover every use case and you may end up locked in and with out some functionality in complex scenarios. ORMs must be learned and you can't carry that knowledge to other projects if you're not using the same tool. SQL knowledge however is always relevant between relational databases and it's transparent since you always know the resulting query and thus the cost.

A few basic API tutorials left me eager to find a production ready service example. I wanted a complete guide. Something I could tinker with to understand the decisions made by professionals. Ardan Labs scratched my itch. Thankfully, I heard about them last year and attended a workshop in Berlin. It placed me on the right track. I received a lot of ideas and it accelerated my path to success. I highly recommend their [workshops](https://www.eventbrite.com/o/ardan-labs-7092394651?utm_source=ardan_website&utm_medium=scrolling_banner&utm_campaign=website_livestream_promo) and [courses](https://education.ardanlabs.com/).

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First day of training has been intense! <a href="https://twitter.com/hashtag/golang?src=hash&amp;ref_src=twsrc%5Etfw">#golang</a> <a href="https://twitter.com/hashtag/ultimategotraining?src=hash&amp;ref_src=twsrc%5Etfw">#ultimategotraining</a> <a href="https://t.co/wdEQ5MrxK0">pic.twitter.com/wdEQ5MrxK0</a></p>&mdash; ivorscott (@ivorsco77) <a href="https://twitter.com/ivorsco77/status/1182291425830019074?ref_src=twsrc%5Etfw">October 10, 2019</a></blockquote>

In the [next post](ultimate-go-react-development-setup-with-docker-part3) I will share insights on building a production ready Go API with docker tooling around it.
