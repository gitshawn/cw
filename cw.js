#!/usr/bin/env node

/**
 * cw.js
 * This is the CLI frontend to CloudWrangler functions. 
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
        // Parse the CLI string
        const cliString = Array.from(process.argv);
        const args = cliString.splice(process.execArgv.length + 2);

        // Check to see if there are any arguments to cw.js
        if (args == '') throw "No arguments provided. Please provide at least a function name to execute.";

        // Parse the arguments to cw.js, the first one is the functionName, the others are set as env vars
        let functionName = '';
        args.forEach((element, index) => {
            if (functionName == '') functionName = element;
            else process.env['CW_VAR_' + index] = element;
        });
    
        // Run the function and wait
        const functionToRun = await import(`./functions/${functionName}.js`);
        await functionToRun.run();

        } catch (err) {
            console.log("Error", err);
    } 
}

run();
