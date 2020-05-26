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

[Part 1](/ultimate-go-react-development-setup-with-docker) demonstrated a workflow for Go and React development using Docker and Makefiles. This post covers transitioning to Go.

We focus on:

- [Why Go?](#why-go)
- [Challenges](#challenges)
- [Training](#training)

# Why Go?

### 1. Many Tools Are Writtten In Go

While deploying apps into the cloud I realized quite quickly that many of the tools I used were written in Go. Tools including [Drone](https://github.com/drone/drone), [Portainer](https://github.com/portainer/portainer), [Docker](https://github.com/moby/moby), [Kubernetes](https://github.com/kubernetes/kubernetes), [Terraform](https://github.com/hashicorp/terraform) and [Traefik](https://github.com/containous/traefik). I began to wonder: _What was I missing? What was so special about the langauge?_

### 2. Renowned Creators

Ken Thompson, Rob Pike and Robert Griesemer, are the original creators of the language. All have amazing credentials. They are the same people behind Unix, UTF-8, the B programming language (predecessor to the C programming language) and the Hotspot JVM. Checkout out [creating the Go programming langauge on Go Time](https://changelog.com/gotime/100).

### 3. Simple Concurrency Model

Concurrency is incredibly difficult to get right even when there is language support. Go has [concurrency primatives](https://www.golang-book.com/books/intro/10) called [goroutines](https://tpaschalis.github.io/goroutines-size/) and [channels](https://www.golang-book.com/books/intro/10#section2) designed for web scale. It's also one of the first modern programming languages to utilize all the cores on a multi-core machine.

### 4. Fast Compilation

Go has fast compile times because of dependency analysis. In Go unused dependencies are compile errors not warnings. This guarantees that no extra code will be compiled during builds, minimizing compilation time. Circular dependencies are also prohibited in the language, keeping the dependency tree lean and clean.

### 5. Proper Built-in Tools

The [standard built-in library](https://golang.org/pkg/) has over 100 packages and each package is well documented.

### 6. Light-weight images

Your code and its dependencies are compiled into a single static binary. Static binaries tend to be small in size. In combination with Docker you can acheive super light weight images, making Go appilcations great for container deployments.

### 7. Tooling and UX

Go tooling provides many commands for many development concerns. To name a few, there's `go test` for testing, `go mod` for [module support](https://blog.golang.org/using-go-modules) and `go tool pprof` for code profiling).

Even Ryan Dahl, the creator of Node and [Deno](https://deno.land/manual), abandoned Node for Go. Deno was originally written in Go before being [replaced with Rust](https://github.com/denoland/deno/issues/205) but the Go UX remained. For example `deno fmt` comes from `go fmt` which is a configure-less code formatter.

### 8. Type Is Life

Go comes with type safety by default. It's a statically typed langauge with an [unconventional type system](https://rakyll.org/typesystem/) and that's a good thing.

# Challenges

Migrating from Node to Go is not without its challenges. I am still making the transition myself. Beyond language syntax and mechanics, I faced 3 challenges building production ready services.

### 1. Rethinking The Way An App Is Structured

In Go, you need develop your own set of rules about where packages belong and stick to them. You need to remember that your application won't compile if you have circular dependencies. In other words, two packages can't cross import one another. This keeps dependency chains clear as well as your mental model of the codebase. It also forces you to consider where initialization occurs in your app. Folders also have a special purpose in Go. Folders are modules, components, or features with distinct APIs. Not a means to organize code arbitrarily. Folders represent unique and purposeful packages containing exported and unexported identifiers.

### 2. Choosing Between Built-in Libraries Or 3rd-party Packages

Rolling your own solutions with standard Go libraries takes time but how it works is transparent because you built it. Using a framework takes arguably less time and comes with a rich feature set, but it's not always clear what happens under the hood. With a full-featured library you might only use a fraction of the available features.

### 3. Choosing Between An ORM Or Using Raw SQL

An ORM like [GORM](https://gorm.io/) can get you to your destination faster but it comes with a cost. GORM can make more queries than otherwise needed under the hood. Going ORM-less already sets you up for taking full advantage of the power of Postgres with raw SQL queries. Plus, ORMs can't possibly cover every use case and you may end up locked in and without some functionality in complex scenarios. Futhermore, ORMs must be learned. You can't carry that knowledge to other projects if you're not using the same tool. SQL knowledge on the other hand is always relevant between relational databases. SQL is transparent. With raw SQL you never hide the cost of your queries.

# Training

Every new go developer should read [Effective Go](https://golang.org/doc/effective_go.html) on the official Go web page. It summarizes _idiomatic_ Go development, in other words, _the Go way_ to do things. Also checkout Todd McLeod's Udemy course, [Learn How To Code: Google's Go Programming Language](https://www.udemy.com/course/go-programming-language), a comprehensive guide to the language fundamentals. For a more project based book tutorial try [Let's Go](https://lets-go.alexedwards.net/) by Alex Edwards. Another book worth mentioning is [The Go Programming Language](https://www.amazon.com/Programming-Language-Addison-Wesley-Professional-Computing-ebook/dp/B0184N7WWS/) by Alan A. A. Donovan and Brian W. Kernighan, it's a classic Go book. I personally enjoyed its thorough explaination of the language and have a copy on my desk.

Even with these sources, I was still eager to find a production ready API service example. Not a web app and nothing basic. I wanted a complete guide I could tinker with. Ardan Labs scratched my itch. Thankfully, I heard about them last year and attended a workshop in Berlin. It placed me on the right track. I highly recommend their [workshops](https://www.eventbrite.com/o/ardan-labs-7092394651?utm_source=ardan_website&utm_medium=scrolling_banner&utm_campaign=website_livestream_promo) and [courses](https://education.ardanlabs.com/).

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First day of training has been intense! <a href="https://twitter.com/hashtag/golang?src=hash&amp;ref_src=twsrc%5Etfw">#golang</a> <a href="https://twitter.com/hashtag/ultimategotraining?src=hash&amp;ref_src=twsrc%5Etfw">#ultimategotraining</a> <a href="https://t.co/wdEQ5MrxK0">pic.twitter.com/wdEQ5MrxK0</a></p>&mdash; ivorscott (@ivorsco77) <a href="https://twitter.com/ivorsco77/status/1182291425830019074?ref_src=twsrc%5Etfw">October 10, 2019</a></blockquote>

_The [next post](ultimate-go-react-development-setup-with-docker-part3) in this series illustrates an updated Docker workflow for a production ready Go service._
