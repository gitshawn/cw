/**
 * AWSECSRunOnAllTasks
 * 
 * Takes a cluster name and:
 * - Enumerates the active tasks
 * - For each task:
 *   - Utilizes ECS Exec to run a command on the task
 *   - Waits for the command to complete
 *   - echo's the logs from the command execution
 *   - Waits for x number of seconds
 *   - Runs the command on the next task
 * 
 * @var {String} CW_VAR_1 The cluster name
 * @var {String} CW_VAR_2 The command to run
 * 
 */

import {
    ECSClient,
    ListTasksCommand,
    ExecuteCommandCommand,
    DescribeTasksCommand,
    DescribeTaskDefinitionCommand
} from "@aws-sdk/client-ecs";

import { 
    CloudWatchLogsClient, 
    GetLogEventsCommand 
} from "@aws-sdk/client-cloudwatch-logs";

const awsconfig = {
    region: "us-west-2"
};

const ecsclient = new ECSClient(awsconfig);

const cwclient = new CloudWatchLogsClient(awsconfig);

//const commandToRun = "pm2 restart all";

const waitTimeBetweenTasksSeconds = 5;

const params = {
    cluster: process.env.CW_VAR_1,
    commandToRun: process.env.CW_VAR_2,
};

const run = async () => {

    try {
        // List the running tasks given the cluster name
        const tasksToRunOn = await ecsclient.send(
            new ListTasksCommand({
                cluster: params.cluster,
                desiredStatus: "RUNNING"
            }))
        
        // For each task, use ECS Exec to run the command
        for (const taskToRunOn of tasksToRunOn.taskArns) {
            const thisTask = await ecsclient.send(
                new ExecuteCommandCommand({
                    cluster: params.cluster,
                    task: taskToRunOn,
                    command: params.commandToRun,
                    interactive: true 
                }))

            // Get the task info for the task we are going to run the command in
            const thisTaskOutput = await ecsclient.send(
                new DescribeTasksCommand({
                    cluster: params.cluster,
                    tasks: [thisTask.taskArn]
                }))
            
            // Get the task definition
            const thisTaskOutputFiltered = thisTaskOutput.tasks.find(x => x.taskArn == thisTask.taskArn);    
            
            // Get the log group using the task definition
            const thisTasksTaskDefinition = await ecsclient.send(
                new DescribeTaskDefinitionCommand({
                    cluster: params.cluster,
                    taskDefinition: thisTaskOutputFiltered.taskDefinitionArn
                }))
            const thisTasksLogGroup = thisTasksTaskDefinition.taskDefinition.containerDefinitions[0].logConfiguration.options['awslogs-group'];

           // Wait 5 seconds for the log stream to be created
           await new Promise(x => setTimeout(x, 5000));

           // Get the logs and echo them to console
           const thisTasksLogs = await cwclient.send(
            new GetLogEventsCommand({
                logGroupName: thisTasksLogGroup,
                logStreamName: thisTask.session.sessionId
            }))
            console.log(`Command output (from Cloudwatch log stream ${thisTasksLogGroup}/${thisTask.session.sessionId}):`);
            console.log(thisTasksLogs.events[0].message);

            // Wait to loop this again, executing the command on the next task
            await new Promise(x => setTimeout(x, (waitTimeBetweenTasksSeconds * 1000)));
        }
    
    } catch (err) {
        console.log("Error", err);
    }

}

run();

//export default function AWSECSRunOnAllTasks() { run(); }
