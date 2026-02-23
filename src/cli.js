#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./commands/login.js";
import { poll } from "./commands/poll.js";

const program = new Command();

program
  .name("instapost")
  .description("Poll Instagram profiles and download new posts")
  .version("0.1.0");

program
  .command("login")
  .description("Open browser to log into Instagram")
  .action(login);

program
  .command("poll")
  .description("Poll profiles for new posts")
  .action(poll);

program.parse();
