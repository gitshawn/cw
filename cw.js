#!/usr/bin/env node

/**
 * This is the CLI frontend to Cloud Wrangler functions. 
 * 
 * It:
 * - Parses the CLI command
 * - Pulls out the function name
 * - Sets the rest of the params as env vars
 * - Executes the function
 * 
 * Example usage:
 * node cw AWSECSWrangleASG [clustername] 
 */

const run = async () => {

    try {
        const cliString = Array.from(process.argv);
        const args = cliString.splice(process.execArgv.length + 2);

        let functionName = '';

        if (args == '') throw "No arguments provided. Please provide at least a function name to execute.";

        args.forEach((element, index) => {
            if (functionName == '') functionName = element;
            else process.env['CW_VAR_' + index] = element;
        });
    
        const functionToRun = await import(`./functions/${functionName}.js`);

        } catch (err) {
            console.log("Error", err);
    } 
}

run();
