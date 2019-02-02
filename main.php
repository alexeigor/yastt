<?php

// t - token
// f - folderid

$opts = getopt('f:t:');

$descriptorspec = array(
   0 => array("pipe", "r"),  // stdin - канал, из которого дочерний процесс будет читать
   1 => array("pipe", "w"),  // stdout - канал, в который дочерний процесс будет записывать
   2 => array("file", "./stt-errors.txt", "w") // stderr - файл для записи
);

$cwd = './';
$env = array();
$cmd = "node ./stt.js --folder_id " . $opts['f'] . " --token " . $opts['t'] . " --stderr_log_file ./stt_err.log";

$process = proc_open($cmd, $descriptorspec, $pipes, $cwd, $env);
if (is_resource($process)) {
    stream_set_blocking($pipes[1], 0);
    stream_set_blocking($pipes[0], 0);

    $handle = fopen("audio.pcm", "r");

    $counter = 1;
    $status = proc_get_status($process);
    while (!feof($handle) && $status["running"])
    {
        $buffer = fread($handle, 1024);

        echo "send chunk: " . $counter . "\n";
        $counter++;
        $fwritelen = fwrite($pipes[0], $buffer);
        fflush($pipes[0]);

        if ($fwritelen == 0) {
            echo "error during writing";
        }

        echo stream_get_contents($pipes[1]);
        usleep(32000);
        $status = proc_get_status($process);

        // fclose($pipes[1]);
    }
    echo "all data sent\n";

    fclose($handle);
    fclose($pipes[0]);

    stream_set_blocking($pipes[1], 1);
    echo stream_get_contents($pipes[1]);
    fclose($pipes[1]);

    // Важно закрывать все каналы перед вызовом
    // proc_close во избежание мертвой блокировки
    $return_value = proc_close($process);

    echo "команда вернула $return_value\n";
}
?>