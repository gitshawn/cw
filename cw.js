#!/usr/bin/env node

/**
 * cw.js
 * This is the CLI frontend to CloudWrangler functions. 
 * 
 * It:
 * - Parses the CLI command
 * - Pulls out the function name
 * - Sets the rest of the params as args to the function
 * - Executes the function
 * 
 * Example usage:
 * node cw AWSECSWrangleASG [region] [clustername]
 */

const run = async () => {

    try {
        // Parse the CLI string
        const cliString = Array.from(process.argv);
        const params = cliString.splice(process.execArgv.length + 2);

        // Check to see if there are any arguments to cw.js
        if (params == '') throw "No arguments provided. Please provide at least a function name to execute.";

        // Parse the arguments to cw.js, the first one is the functionName, the others are args to the function
        let functionName = params[0];
        const args = params.slice(1);

        // Run the function and wait
        const functionToRun = await import(`./functions/${functionName}.js`);
        await functionToRun.run(...args);

        } catch (err) {
            console.log("Error", err);
    } 
}

run();
