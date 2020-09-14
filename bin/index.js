#!/usr/bin/env node

import Helper from "./helper.js";

const main = async () => {
  console.error(process.argv);
  const args = process.argv.slice(2);

  if (args.length < 2) {
    // tslint:disable-next-line:no-console
    console.error("Usage: git-remote-dgit <name> <url>");
    process.exit(1);
  }

  const name = args[0] === args[1] ? "_" : args[0];
  const url = args[1];
  console.log(name);
  const helper = new Helper(name, url);
  helper
    .initialize()
    .then((_) => {
      return helper.run();
    })
    .catch((err) => {
      // tslint:disable-next-line:no-console
      console.error("Error. " + err.message);
      process.exit(1);
    });
};

main();
